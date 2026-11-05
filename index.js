const github = require('@actions/github')
const core = require('@actions/core')
const _ = require('lodash')
const cc = require('@conventional-commits/parser')
const fs = require('fs').promises
const process = require('process')
const { setTimeout } = require('timers/promises')

const githubServerUrl = (process.env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/+$/, '')

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

// Closing keywords, as supported by GitHub:
// https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/using-keywords-in-issues-and-pull-requests
// Matches "KEYWORD #123", "KEYWORD: #123", "KEYWORD owner/repo#123" and "KEYWORD <server>/owner/repo/(issues|discussions)/123"
const escapeRegExp = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const reClosingRef = new RegExp(
  '(?<![\\w/-])(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?[ \\t]+(?:' +
  `${escapeRegExp(githubServerUrl)}/([\\w.-]+)/([\\w.-]+)/(?:issues|discussions)/([0-9]+)` +
  '|' +
  '(?:([\\w.-]+)/([\\w.-]+))?#([0-9]+)' +
  ')(?![\\w-])',
  'gi'
)

/**
 * Extract issue / discussion references preceded by a closing keyword from a commit message
 */
function parseClosingRefs (message, owner, repo) {
  const refs = []
  for (const m of (message || '').matchAll(reClosingRef)) {
    const refOwner = m[1] || m[4] || owner
    const refRepo = m[2] || m[5] || repo
    const number = parseInt(m[3] || m[6])
    const key = buildRefKey(`${refOwner}/${refRepo}`, number)
    if (!refs.some(r => r.key === key)) {
      refs.push({ owner: refOwner, repo: refRepo, number, key })
    }
  }
  return refs
}

function buildRefKey (nameWithOwner, number) {
  return `${nameWithOwner}#${number}`.toLowerCase()
}

/**
 * Label to display for an issue / discussion: "#123" for the current repo, "owner/repo#123" otherwise
 */
function buildRefLabel ({ nameWithOwner, number, owner, repo }) {
  if (!nameWithOwner || nameWithOwner.toLowerCase() === `${owner}/${repo}`.toLowerCase()) {
    return `#${number}`
  }
  return `${nameWithOwner}#${number}`
}

/**
 * Resolve a referenced number to either an issue or a discussion (both share the same numbering).
 * Returns null if the reference is a pull request or cannot be found.
 */
async function fetchClosingRef (gh, ref) {
  let data
  try {
    data = await gh.graphql(`
      query closingRef ($owner: String!, $repo: String!, $num: Int!) {
        repository (owner: $owner, name: $repo) {
          nameWithOwner
          issueOrPullRequest (number: $num) {
            __typename
            ... on Issue {
              number
              url
              author {
                login
                url
              }
            }
          }
          discussion (number: $num) {
            number
            url
            author {
              login
              url
            }
          }
        }
      }
    `, {
      owner: ref.owner,
      repo: ref.repo,
      num: ref.number
    })
  } catch (err) {
    // Only one of issueOrPullRequest / discussion can exist for a given number,
    // so a NOT_FOUND error on the other one is expected. Use the partial data.
    if (err.data) {
      data = err.data
    } else {
      throw err
    }
  }
  const nameWithOwner = _.get(data, 'repository.nameWithOwner')
  const issue = _.get(data, 'repository.issueOrPullRequest')
  const discussion = _.get(data, 'repository.discussion')
  const node = (issue && issue.__typename === 'Issue') ? issue : discussion
  if (!nameWithOwner || !node) {
    return null
  }
  return {
    key: buildRefKey(nameWithOwner, node.number),
    nameWithOwner,
    number: node.number,
    url: node.url,
    author: node.author
  }
}

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
  const gh = github.getOctokit(token)
  const owner = github.context.repo.owner
  const repo = github.context.repo.repo
  const currentISODate = (new Date()).toISOString().substring(0, 10)

  let latestTag = null
  let previousTag = null

  if (tag && (fromTag || toTag)) {
    return core.setFailed('Must provide EITHER input tag OR (fromTag and toTag), not both!')
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
      return core.setFailed(`Provided tag doesn't match latest tag ${tag}.`)
    }

    core.info(`Using latest tag: ${latestTag.name}`)
    core.info(`Using previous tag: ${previousTag.name}`)
  } else if (fromTag && toTag) {
    // GET FROM + TO TAGS FROM INPUTS

    latestTag = { name: fromTag }
    previousTag = { name: toTag }

    core.info(`Using tag range: ${fromTag} to ${toTag}`)
  } else {
    return core.setFailed('Must provide either input tag OR (fromTag and toTag). None were provided!')
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
        message: commit.commit.message,
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
          message: commit.commit.message,
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
      changesFile.push(`- due to [\`${breakChange.sha.substring(0, 7)}\`](${breakChange.url}) - ${subjectFile.output}:\n\n${body}\n`)
      changesVar.push(`- due to [\`${breakChange.sha.substring(0, 7)}\`](${breakChange.url}) - ${subjectVar.output}:\n\n${body}\n`)
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

  // -> Cache of resolved issue / discussion references (key => ref or null)
  const closingRefsCache = new Map()

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
      changesFile.push(`- [\`${commit.sha.substring(0, 7)}\`](${commit.url}) - ${scope}${subjectFile.output}`)
      changesVar.push(`- [\`${commit.sha.substring(0, 7)}\`](${commit.url}) - ${scope}${subjectVar.output}`)

      if (includeRefIssues) {
        const relIssues = []

        // -> Issues linked to the PR(s)
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
                        repository {
                          nameWithOwner
                        }
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
            const prIssues = _.get(issuesRaw, 'repository.pullRequest.closingIssuesReferences.nodes', [])
            for (const prIssue of prIssues) {
              const nameWithOwner = _.get(prIssue, 'repository.nameWithOwner', `${owner}/${repo}`)
              const key = buildRefKey(nameWithOwner, prIssue.number)
              if (!relIssues.some(r => r.key === key)) {
                relIssues.push({
                  key,
                  nameWithOwner,
                  number: prIssue.number,
                  url: prIssue.url,
                  author: prIssue.author
                })
              }
            }
          } catch (err) {
            core.warning(`Failed to query issues related to PR ${prId}. Skipping.`)
          }
        }

        // -> Issues / discussions referenced with a closing keyword in the commit message
        const msgRefs = parseClosingRefs(commit.message, owner, repo)
        for (const ref of msgRefs) {
          if (relIssues.some(r => r.key === ref.key)) {
            continue
          }
          let relRef = closingRefsCache.get(ref.key)
          if (relRef === undefined) {
            core.info(`Querying issue / discussion ${ref.owner}/${ref.repo}#${ref.number} referenced in commit ${commit.sha}...`)
            await setTimeout(500) // Make sure we don't go over GitHub API rate limits
            try {
              relRef = await fetchClosingRef(gh, ref)
              if (!relRef) {
                core.info(`${ref.owner}/${ref.repo}#${ref.number} is not an issue or discussion. Skipping.`)
              }
            } catch (err) {
              core.warning(`Failed to query ${ref.owner}/${ref.repo}#${ref.number} referenced in commit ${commit.sha}. Skipping.`)
              relRef = null
            }
            closingRefsCache.set(ref.key, relRef)
          }
          if (relRef && !relIssues.some(r => r.key === relRef.key)) {
            relIssues.push(relRef)
          }
        }

        // -> Render related issues / discussions
        const relIssuePrefixDecoration = useGitmojis ? '- :arrow_lower_right:' : '-'
        for (const relIssue of relIssues) {
          const label = buildRefLabel({ nameWithOwner: relIssue.nameWithOwner, number: relIssue.number, owner, repo })
          const authorLogin = _.get(relIssue, 'author.login')
          if (authorLogin) {
            changesFile.push(`  ${relIssuePrefixDecoration} *${relIssuePrefix} issue [${label}](${relIssue.url}) opened by [@${authorLogin}](${relIssue.author.url})*`)
            changesVar.push(`  ${relIssuePrefixDecoration} *${relIssuePrefix} issue ${label} opened by @${authorLogin}*`)
          } else {
            changesFile.push(`  ${relIssuePrefixDecoration} *${relIssuePrefix} issue [${label}](${relIssue.url})*`)
            changesVar.push(`  ${relIssuePrefixDecoration} *${relIssuePrefix} issue ${label}*`)
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
    core.info(`Couldn't find a ${changelogFilePath}, creating a new one...`)
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

  // add newline character at end of output if it doesn't already exists
  if (!output.endsWith('\n')) {
    output += '\n'
  }
  output += `[${latestTag.name}]: ${githubServerUrl}/${owner}/${repo}/compare/${previousTag.name}...${latestTag.name}\n`

  // WRITE CHANGELOG TO FILE

  await fs.writeFile(changelogFilePath, output)
}

main()
