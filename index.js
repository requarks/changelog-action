const github = require('@actions/github')
const core = require('@actions/core')
const _ = require('lodash')
const cc = require('@conventional-commits/parser')
const fs = require('fs').promises
const process = require('process')
const { setTimeout } = require('timers/promises')

const githubServerUrl = process.env.GITHUB_SERVER_URL || 'https://github.com'

const allTypes = [
  { types: ['feat', 'feature'], header: 'New Features', icon: ':sparkles:' },
  { types: ['fix', 'bugfix'], header: 'Bug Fixes', icon: ':bug:', relIssuePrefix: 'fixes' },
  { types: ['perf'], header: 'Performance Improvements', icon: ':zap:' },
  { types: ['refactor'], header: 'Refactors', icon: ':recycle:' },
  { types: ['test', 'tests'], header: 'Tests', icon: ':white_check_mark:' },
  { types: ['build', 'ci'], header: 'Build System', icon: ':construction_worker:' },
  { types: ['doc', 'docs'], header: 'Documentation Changes', icon: ':memo:' },
  { types: ['style'], header: 'Code Style Changes', icon: ':art:' },
  { types: ['chore'], header: 'Chores', icon: ':wrench:' },
  { types: ['other'], header: 'Other Changes', icon: ':flying_saucer:' }
]

const rePrId = /#([0-9]+)/g
const rePrEnding = /\(#([0-9]+)\)$/

function buildSubject ({ writeToFile, subject, author, authorUrl, owner, repo }) {
  const hasPR = rePrEnding.test(subject)
  const prs = []
  let output = subject
  if (writeToFile) {
    const authorLine = author ? ` by [@${author}](${authorUrl})` : ''
    if (hasPR) {
      const prMatch = subject.match(rePrEnding)
      const msgOnly = subject.slice(0, prMatch[0].length * -1)
      output = msgOnly.replace(rePrId, (m, prId) => {
        prs.push(prId)
        return `[#${prId}](${githubServerUrl}/${owner}/${repo}/pull/${prId})`
      })
      output += `*(PR [#${prMatch[1]}](${githubServerUrl}/${owner}/${repo}/pull/${prMatch[1]})${authorLine})*`
    } else {
      output = subject.replace(rePrId, (m, prId) => {
        return `[#${prId}](${githubServerUrl}/${owner}/${repo}/pull/${prId})`
      })
      if (author) {
        output += ` *(commit by [@${author}](${authorUrl}))*`
      }
    }
  } else {
    if (hasPR) {
      output = subject.replace(rePrEnding, (m, prId) => {
        prs.push(prId)
        return author ? `*(PR #${prId} by @${author})*` : `*(PR #${prId})*`
      })
    } else {
      output = author ? `${subject} *(commit by @${author})*` : subject
    }
  }
  return {
    output,
    prs
  }
}

async function main () {
  const token = core.getInput('token')
  const tag = core.getInput('tag')
  const fromTag = core.getInput('fromTag')
  const toTag = core.getInput('toTag')
  const excludeTypes = (core.getInput('excludeTypes') || '').split(',').map(t => t.trim()).filter(t => t)
  const excludeScopes = (core.getInput('excludeScopes') || '').split(',').map(t => t.trim()).filter(t => t)
  const restrictToTypes = (core.getInput('restrictToTypes') || '').split(',').map(t => t.trim()).filter(t => t)
  const writeToFile = core.getBooleanInput('writeToFile')
  const changelogFilePath = core.getInput('changelogFilePath')
  const includeRefIssues = core.getBooleanInput('includeRefIssues')
  const useGitmojis = core.getBooleanInput('useGitmojis')
  const includeInvalidCommits = core.getBooleanInput('includeInvalidCommits')
  const reverseOrder = core.getBooleanInput('reverseOrder')
  const includeLinksToGithub = core.getBooleanInput('includeLinksToGithub')
  const gh = github.getOctokit(token)
  const owner = github.context.repo.owner
  const repo = github.context.repo.repo
  const currentISODate = (new Date()).toISOString().substring(0, 10)

  let latestTag = null
  let previousTag = null

  if (tag && (fromTag || toTag)) {
    return core.setFailed(`Must provide EITHER input tag OR (fromTag and toTag), not both!`)
  } else if (tag) {

    // GET LATEST + PREVIOUS TAGS

    core.info(`Using input tag: ${tag}`)

    const tagsRaw = await gh.graphql(`
      query lastTags ($owner: String!, $repo: String!) {
        repository (owner: $owner, name: $repo) {
          refs(first: 2, refPrefix: "refs/tags/", orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) {
            nodes {
              name
              target {
                oid
              }
            }
          }
        }
      }
    `, {
      owner,
      repo
    })

    latestTag = _.get(tagsRaw, 'repository.refs.nodes[0]')
    previousTag = _.get(tagsRaw, 'repository.refs.nodes[1]')

    if (!latestTag) {
      return core.setFailed('Couldn\'t find the latest tag. Make sure you have an existing tag already before creating a new one.')
    }
    if (!previousTag) {
      return core.setFailed('Couldn\'t find a previous tag. Make sure you have at least 2 tags already (current tag + previous initial tag).')
    }

    if (latestTag.name !== tag) {
      return core.setFailed(`Provided tag doesn\'t match latest tag ${tag}.`)
    }

    core.info(`Using latest tag: ${latestTag.name}`)
    core.info(`Using previous tag: ${previousTag.name}`)
  } else if (fromTag && toTag) {

    // GET FROM + TO TAGS FROM INPUTS

    latestTag = { name: fromTag }
    previousTag = { name: toTag }

    core.info(`Using tag range: ${fromTag} to ${toTag}`)
  } else {
    return core.setFailed(`Must provide either input tag OR (fromTag and toTag). None were provided!`)
  }

  // GET COMMITS

  let curPage = 0
  let totalCommits = 0
  let hasMoreCommits = false
  const commits = []
  do {
    hasMoreCommits = false
    curPage++
    const commitsRaw = await gh.rest.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${previousTag.name}...${latestTag.name}`,
      page: curPage,
      per_page: 100
    })
    totalCommits = _.get(commitsRaw, 'data.total_commits', 0)
    const rangeCommits = _.get(commitsRaw, 'data.commits', [])
    commits.push(...rangeCommits)
    if ((curPage - 1) * 100 + rangeCommits.length < totalCommits) {
      hasMoreCommits = true
    }
  } while (hasMoreCommits)

  if (!commits || commits.length < 1) {
    return core.setFailed('Couldn\'t find any commits between latest and previous tags.')
  }

  // PARSE COMMITS

  const commitsParsed = []
  const breakingChanges = []
  for (const commit of commits) {
    try {
      const cAst = cc.toConventionalChangelogFormat(cc.parser(commit.commit.message))
      commitsParsed.push({
        ...cAst,
        type: cAst.type.toLowerCase(),
        sha: commit.sha,
        url: commit.html_url,
        author: _.get(commit, 'author.login'),
        authorUrl: _.get(commit, 'author.html_url')
      })
      for (const note of cAst.notes) {
        if (note.title === 'BREAKING CHANGE') {
          breakingChanges.push({
            sha: commit.sha,
            url: commit.html_url,
            subject: cAst.subject,
            author: _.get(commit, 'author.login'),
            authorUrl: _.get(commit, 'author.html_url'),
            text: note.text
          })
        }
      }
      core.info(`[OK] Commit ${commit.sha} of type ${cAst.type} - ${cAst.subject}`)
    } catch (err) {
      if (includeInvalidCommits) {
        commitsParsed.push({
          type: 'other',
          subject: commit.commit.message,
          sha: commit.sha,
          url: commit.html_url,
          author: _.get(commit, 'author.login'),
          authorUrl: _.get(commit, 'author.html_url')
        })
        core.info(`[OK] Commit ${commit.sha} with invalid type, falling back to other - ${commit.commit.message}`)
      } else {
        core.info(`[INVALID] Skipping commit ${commit.sha} as it doesn't follow conventional commit format.`)
      }
    }
  }

  if (commitsParsed.length < 1) {
    return core.setFailed('No valid commits parsed since previous tag.')
  }

  if (reverseOrder) {
    commitsParsed.reverse()
  }

  // BUILD CHANGELOG

  const changesFile = []
  const changesVar = []
  let idx = 0

  // -> Handle breaking changes
  if (breakingChanges.length > 0) {
    changesFile.push(useGitmojis ? '### :boom: BREAKING CHANGES' : '### BREAKING CHANGES')
    changesVar.push(useGitmojis ? '### :boom: BREAKING CHANGES' : '### BREAKING CHANGES')
    for (const breakChange of breakingChanges) {
      const body = breakChange.text.split('\n').map(ln => `  ${ln}`).join('  \n')
      const subjectFile = buildSubject({
        writeToFile: true,
        subject: breakChange.subject,
        author: breakChange.author,
        authorUrl: breakChange.authorUrl,
        owner,
        repo
      })
      const subjectVar = buildSubject({
        writeToFile: false,
        subject: breakChange.subject,
        author: breakChange.author,
        authorUrl: breakChange.authorUrl,
        owner,
        repo
      })
      const linkToBreakingChange = includeLinksToGithub ? `- [\`${breakChange.sha.substring(0, 7)}\`](${breakChange.url}) - ` : ''
      changesFile.push(`- due to ${linkToBreakingChange}${subjectFile.output}:\n\n${body}\n`)
      changesVar.push(`- due to ${linkToBreakingChange}${subjectVar.output}:\n\n${body}\n`)
    }
    idx++
  }

  // -> Filter types
  const types = []
  for (const type of allTypes) {
    if (restrictToTypes.length > 0) {
      if (_.intersection(type.types, restrictToTypes).length > 0) {
        types.push(type)
      }
    } else {
      if (_.intersection(type.types, excludeTypes).length === 0) {
        types.push(type)
      }
    }
  }
  core.info(`Selected Types: ${types.map(t => t.types.join(', ')).join(', ')}`)

  // -> Group commits by type
  for (const type of types) {
    const matchingCommits = commitsParsed.filter(c => type.types.includes(c.type))
    if (matchingCommits.length < 1) {
      continue
    }
    if (idx > 0) {
      changesFile.push('')
      changesVar.push('')
    }
    changesFile.push(useGitmojis ? `### ${type.icon} ${type.header}` : `### ${type.header}`)
    changesVar.push(useGitmojis ? `### ${type.icon} ${type.header}` : `### ${type.header}`)

    const relIssuePrefix = type.relIssuePrefix || 'addresses'

    for (const commit of matchingCommits) {
      if (excludeScopes.length > 0 && excludeScopes.includes(commit.scope)) {
        continue
      }
      const scope = commit.scope ? `**${commit.scope}**: ` : ''
      const subjectFile = buildSubject({
        writeToFile: true,
        subject: commit.subject,
        author: commit.author,
        authorUrl: commit.authorUrl,
        owner,
        repo
      })
      const subjectVar = buildSubject({
        writeToFile: false,
        subject: commit.subject,
        author: commit.author,
        authorUrl: commit.authorUrl,
        owner,
        repo
      })
      const linkToCommit = includeLinksToGithub ? `- [\`${commit.sha.substring(0, 7)}\`](${commit.url})` : ''
      changesFile.push(`${linkToCommit} - ${scope}${subjectFile.output}`)
      changesVar.push(`${linkToCommit} - ${scope}${subjectVar.output}`)

      if (includeRefIssues && subjectVar.prs.length > 0) {
        for (const prId of subjectVar.prs) {
          core.info(`Querying related issues for PR ${prId}...`)
          await setTimeout(500) // Make sure we don't go over GitHub API rate limits
          try {
            const issuesRaw = await gh.graphql(`
              query relIssues ($owner: String!, $repo: String!, $prId: Int!) {
                repository (owner: $owner, name: $repo) {
                  pullRequest(number: $prId) {
                    closingIssuesReferences(first: 50) {
                      nodes {
                        number
                        url
                        author {
                          login
                          url
                        }
                      }
                    }
                  }
                }
              }
            `, {
              owner,
              repo,
              prId: parseInt(prId)
            })
            const relIssues = _.get(issuesRaw, 'repository.pullRequest.closingIssuesReferences.nodes')
            for (const relIssue of relIssues) {
              const authorLogin = _.get(relIssue, 'author.login')
              const linkToRelIssue = includeLinksToGithub ? `[#${relIssue.number}](${relIssue.url})` : `#${relIssue.number}`
              if (authorLogin) {
                changesFile.push(`  - :arrow_lower_right: *${relIssuePrefix} issue ${linkToRelIssue} opened by [@${authorLogin}](${relIssue.author.url})*`)
                changesVar.push(`  - :arrow_lower_right: *${relIssuePrefix} issue #${relIssue.number} opened by @${authorLogin}*`)
              } else {
                changesFile.push(`  - :arrow_lower_right: *${relIssuePrefix} issue ${linkToRelIssue}*`)
                changesVar.push(`  - :arrow_lower_right: *${relIssuePrefix} issue #${relIssue.number}*`)
              }
            }
          } catch (err) {
            core.warning(`Failed to query issues related to PR ${prId}. Skipping.`)
          }
        }
      }
    }
    idx++
  }

  if (changesFile.length > 0) {
    changesFile.push('')
    changesVar.push('')
  } else {
    return core.warning('Nothing to add to changelog because of excluded types.')
  }

  core.setOutput('changes', changesVar.join('\n'))

  if (!writeToFile) { return }

  // PARSE EXISTING CHANGELOG

  let chglog = ''
  try {
    chglog = await fs.readFile(changelogFilePath, 'utf8')
  } catch (err) {
    core.info(`Couldn\'t find a ${changelogFilePath}, creating a new one...`)
    chglog = `# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
`
  }

  // UPDATE CHANGELOG CONTENTS

  const lines = chglog.replace(/\r/g, '').split('\n')
  let firstVersionLine = _.findIndex(lines, l => l.startsWith('## '))

  if (firstVersionLine >= 0 && lines[firstVersionLine].startsWith(`## [${latestTag.name}`)) {
    return core.notice('This version already exists in the CHANGELOG! No change will be made to the CHANGELOG.')
  }

  if (firstVersionLine < 0) {
    firstVersionLine = lines.length
  }

  let output = ''
  if (firstVersionLine > 0) {
    output += lines.slice(0, firstVersionLine).join('\n') + '\n'
  }
  output += `## [${latestTag.name}] - ${currentISODate}\n${changesFile.join('\n')}\n`
  if (firstVersionLine < lines.length) {
    output += '\n' + lines.slice(firstVersionLine).join('\n')
  }

  // add newline character at end of output if it doesn't already exist
  if (!output.endsWith('\n')) {
    output += '\n'
  }
  output += `[${latestTag.name}]: ${githubServerUrl}/${owner}/${repo}/compare/${previousTag.name}...${latestTag.name}\n`

  // WRITE CHANGELOG TO FILE

  await fs.writeFile(changelogFilePath, output)
}

main()
