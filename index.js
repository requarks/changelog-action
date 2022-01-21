const github = require('@actions/github')
const core = require('@actions/core')
const _ = require('lodash')
const cc = require('@conventional-commits/parser')
const fs = require('fs').promises
const commonmark = require('commonmark')

const types = [
  { types: ['feat', 'feature'], header: 'New Features' },
  { types: ['fix', 'bugfix'], header: 'Bug Fixes' },
  { types: ['perf'], header: 'Performance Improvements' },
  { types: ['refactor'], header: 'Refactors' },
  { types: ['test', 'tests'], header: 'Tests' },
  { types: ['build', 'ci'], header: 'Build System' },
  { types: ['doc', 'docs'], header: 'Documentation Changes' },
  { types: ['style'], header: 'Code Style Changes' },
  { types: ['chore'], header: 'Chores' },
  { types: ['other'], header: 'Other Changes' }
]

async function main () {
  const token = core.getInput('token')
  const tag = core.getInput('tag')
  const excludeTypes = (core.getInput('excludeTypes') || '').split(',').map(t => t.trim())
  const gh = github.getOctokit(token)
  const owner = 'Requarks'
  const repo = 'wiki'
  const currentISODate = (new Date()).toISOString().substring(0,10)

  // GET LATEST + PREVIOUS TAGS

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
    owner: 'Requarks',
    repo: 'wiki'
  })

  const latestTag = _.get(tagsRaw, 'repository.refs.nodes[0]')
  const previousTag = _.get(tagsRaw, 'repository.refs.nodes[1]')

  if (!latestTag) {
    return core.setFailed('Couldn\'t find the latest tag.')
  }
  if (!previousTag) {
    return core.setFailed('Couldn\'t find a previous tag. Make sure you have at least 2 tags already.')
  }

  if (latestTag.name !== tag) {
    return core.setFailed('Provided tag doesn\'t match latest tag.')
  }

  core.info(`Using latest tag: ${latestTag.name}`)
  core.info(`Using previous tag: ${previousTag.name}`)

  // GET COMMITS

  const commitsRaw = await gh.rest.repos.compareCommits({
    owner,
    repo,
    base: previousTag.target.oid,
    head: latestTag.target.oid
  })

  const commits = _.get(commitsRaw, 'data.commits', [])

  if (!commits || commits.length < 1) {
    return core.setFailed('Couldn\'t find any commits between latest and previous tags.')
  }

  // PARSE COMMITS

  const commitsParsed = []
  for (const commit of commits) {
    try {
      const cAst = cc.toConventionalChangelogFormat(cc.parser(commit.commit.message))
      commitsParsed.push({
        ...cAst,
        sha: commit.sha,
        author: commit.author.login
      })
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
    changes.push(`### ${type.header}`)
    for (const commit of matchingCommits) {
      const scope = commit.scope ? `**${commit.scope}:** ` : ''
      changes.push(`- ${scope}${commit.subject}`)
    }
    idx++
  }

  if (changes.length < 1) {
    return core.setWarn('Nothing to add to changelog because of excluded types.')
  }

  core.setOutput('changes', changes.join('\n'))

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

  if (firstVersionLine >= 0 && lines[firstVersionLine].startsWith(`## [${tag}`)) {
    return core.notice('This version already exists in the CHANGELOG! No change will be made to the CHANGELOG.')
  }

  if (firstVersionLine < 0) {
    firstVersionLine = lines.length
  }

  let output = ''
  if (firstVersionLine > 0) {
    output += lines.slice(0, firstVersionLine).join('\n') + '\n'
  }
  output += `## [${tag}] - ${currentISODate}\n${changes.join('\n')}\n`
  if (firstVersionLine < lines.length) {
    output += '\n' + lines.slice(firstVersionLine).join('\n')
  }
  output += `\n[${tag}]: https://github.com/${owner}/${repo}/compare/${previousTag.name}...${tag}`

  // WRITE CHANGELOG TO FILE

  await fs.writeFile('CHANGELOG.md', output)
}

main()
