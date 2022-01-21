const github = require('@actions/github')
const core = require('@actions/core')

async function main () {
  const token = core.getInput('token')
  const gh = github.getOctokit(token)

  const { data: tags } = await gh.repos.listTags({ owner: 'Requarks', repo: 'wiki' /* ...github.context.repo */, per_page: 5 })

  console.info(tags)
}

main()
