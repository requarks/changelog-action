const github = require('@actions/github')
const core = require('@actions/core')
const _ = require('lodash')
const cc = require('@conventional-commits/parser')
const fs = require('fs').promises

const types = [
  { types: ['feat', 'feature'], header: 'New Features', icon: ':sparkles:' },
  { types: ['fix', 'bugfix'], header: 'Bug Fixes', icon: ':bug:' },
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
  let final = subject
  if (writeToFile) {
    if (hasPR) {
      const prMatch = subject.match(rePrEnding)
      const msgOnly = subject.slice(0, prMatch[0].length * -1)
      final = msgOnly.replace(rePrId, (m, prId) => {
        return `[#${prId}](https://github.com/${owner}/${repo}/pull/${prId})`
      })
      final += `*(PR [#${prMatch[1]}](https://github.com/${owner}/${repo}/pull/${prMatch[1]}) by [@${author}](${authorUrl}))*`
    } else {
      final = subject.replace(rePrId, (m, prId) => {
        return `[#${prId}](https://github.com/${owner}/${repo}/pull/${prId})`
      })
      final += ` *(commit by [@${author}](${authorUrl}))*`
    }
  } else {
    if (hasPR) {
      final = subject.replace(rePrEnding, (m, prId) => {
        return `*(PR #${prId} by @${author})*`
      })
    } else {
      final = `${subject} *(commit by @${author})*`
    }
  }
  return final
}

async function main () {
  const token = core.getInput('token')
  const tag = core.getInput('tag')
  const fromTag = core.getInput('fromTag')
  const toTag = core.getInput('toTag')
  const excludeTypes = (core.getInput('excludeTypes') || '').split(',').map(t => t.trim())
  const writeToFile = core.getBooleanInput('writeToFile')
  const useGitmojis = core.getBooleanInput('useGitmojis')
  const gh = github.getOctokit(token)
  const owner = github.context.repo.owner
  const repo = github.context.repo.repo
  const currentISODate = (new Date()).toISOString().substring(0, 10)

  let latestTag = null
  let previousTag = null

  if (tag) {
    
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
  } else if (fromTag && toTag) {

    // GET LATEST + PREVIOUS TAGS FROM INPUT

    latestTag = { name: fromTag };
    previousTag = { name: toTag };
  } else {
    return core.setFailed(`Input tag or fromTag and toTag are required.`) 
  }

  core.info(`Using latest tag: ${latestTag.name}`)
  core.info(`Using previous tag: ${previousTag.name}`)

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
        sha: commit.sha,
        url: commit.html_url,
        author: commit.author.login,
        authorUrl: commit.author.html_url
      })
      for (const note of cAst.notes) {
        if (note.title === 'BREAKING CHANGE') {
          breakingChanges.push({
            sha: commit.sha,
            url: commit.html_url,
            subject: cAst.subject,
            author: commit.author.login,
            authorUrl: commit.author.html_url,
            text: note.text
          })
        }
      }
      core.info(`[OK] Commit ${commit.sha} of type ${cAst.type} - ${cAst.subject}`)
    } catch (err) {
      core.info(`[INVALID] Skipping commit ${commit.sha} as it doesn't follow conventional commit format.`)
    }
  }

  if (commitsParsed.length < 1) {
    return core.setFailed('No valid commits parsed since previous tag.')
  }

  // BUILD CHANGELOG

  const changes = []

  let idx = 0
  for (const type of types) {
    if (_.intersection(type.types, excludeTypes).length > 0) {
      continue
    }
    const matchingCommits = commitsParsed.filter(c => type.types.includes(c.type))
    if (matchingCommits.length < 1) {
      continue
    }
    if (idx > 0) {
      changes.push('')
    }
    changes.push(useGitmojis ? `### ${type.icon} ${type.header}` : `### ${type.header}`)
    for (const commit of matchingCommits) {
      const scope = commit.scope ? `**${commit.scope}**: ` : ''
      const subject = buildSubject({
        writeToFile,
        subject: commit.subject,
        author: commit.author,
        authorUrl: commit.authorUrl,
        owner,
        repo
      })
      changes.push(`- [\`${commit.sha.substring(0, 7)}\`](${commit.url}) - ${scope}${subject}`)
    }
    idx++
  }

  if (breakingChanges.length > 0) {
    changes.push('')
    changes.push(useGitmojis ? '### :boom: BREAKING CHANGES' : '### BREAKING CHANGES')
    for (const breakChange of breakingChanges) {
      const body = breakChange.text.split('\n').map(ln => `  ${ln}`).join('  \n')
      const subject = buildSubject({
        writeToFile,
        subject: breakChange.subject,
        author: breakChange.author,
        authorUrl: breakChange.authorUrl,
        owner,
        repo
      })
      changes.push(`- due to [\`${breakChange.sha.substring(0, 7)}\`](${breakChange.url}) - ${subject}:\n\n${body}\n`)
    }
  } else if (changes.length > 0) {
    changes.push('')
  } else {
    return core.warning('Nothing to add to changelog because of excluded types.')
  }

  core.setOutput('changes', changes.join('\n'))

  if (!writeToFile) { return }

  // PARSE EXISTING CHANGELOG

  let chglog = ''
  try {
    chglog = await fs.readFile('CHANGELOG.md', 'utf8')
  } catch (err) {
    core.info('Couldn\'t find a CHANGELOG.md, creating a new one...')
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
  output += `## [${latestTag.name}] - ${currentISODate}\n${changes.join('\n')}\n`
  if (firstVersionLine < lines.length) {
    output += '\n' + lines.slice(firstVersionLine).join('\n')
  }
  output += `\n[${latestTag.name}]: https://github.com/${owner}/${repo}/compare/${previousTag.name}...${latestTag.name}`

  // WRITE CHANGELOG TO FILE

  await fs.writeFile('CHANGELOG.md', output)
}

main()
