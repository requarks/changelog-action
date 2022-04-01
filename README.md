# Changelog from Conventional Commits - Github Action

This GitHub Action automatically generates a changelog based on all the [Conventional Commits](https://www.conventionalcommits.org) between the latest tag and the previous tag.

## Features

- Generates the CHANGELOG changes in Markdown format
- Turns PR ids into links and add the PR author.
- Prepends a shortened commit SHA ID to the commit for quick access.
- `BREAKING CHANGE` notes are added at the bottom of the changelog version along with the related commit.
- Automatically injects the changes into the CHANGELOG.md file or creates it if it doesn't exist yet. *(optional)*
- Will not mess up with any header or instructions you already have at the top of your CHANGELOG.md.
- Will not add duplicate version changes if it already exists in the CHANGELOG.md file.
- Optionally exclude types from the CHANGELOG. (default: `build,docs,other,style`)

## Example workflow
``` yaml
name: Deploy

on:
  push:
    tags:
      - v[0-9]+.[0-9]+.[0-9]+

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v2

      - name: Update CHANGELOG
        id: changelog
        uses: Requarks/changelog-action@v1
        with:
          token: ${{ github.token }}
          tag: ${{ github.ref_name }}

      - name: Create Release
        uses: ncipollo/release-action@v1
        with:
          allowUpdates: true
          draft: false
          name: ${{ github.ref_name }}
          body: ${{ steps.changelog.outputs.changes }}
          token: ${{ github.token }}

      - name: Commit CHANGELOG.md
        uses: stefanzweifel/git-auto-commit-action@v4
        with:
          branch: main
          commit_message: 'docs: update CHANGELOG.md for ${{ github.ref_name }} [skip ci]'
          file_pattern: CHANGELOG.md
```

## Inputs
* `token`: Your GitHub token (e.g. `${{ github.token }}`) - **REQUIRED**
* `tag`: The latest tag which triggered the job. (e.g. `${{ github.ref_name }}`) - **REQUIRED**
* `excludeTypes`: A comma-separated list of commit types you want to exclude from the changelog (e.g. `doc,chore,perf`) - **Optional** - Default: `build,docs,other,style`
* `writeToFile`: Should CHANGELOG.md be updated with latest changelog - **Optional** - Default: `true`
* `useGitmojis`: Should type headers be prepended with their related gitmoji - **Optional** - Default: `true`

## Outputs
* `changes`: Generated CHANGELOG changes for the latest tag, without the version / date header (for use in GitHub Releases).

## Important

You must already have 2 tags in your repository (1 previous tag + the current latest tag triggering the job). The job will exit with an error if it can't find the previous tag!
