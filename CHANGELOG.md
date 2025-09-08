# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v1.10.3] - 2025-09-08
### :bug: Bug Fixes
- [`4fe6d8d`](https://github.com/requarks/changelog-action/commit/4fe6d8d4e49245e9cef5237fa0f07110930a2a11) - omit arrow icon in related issues when useGitmojis is false *(commit by [@NGPixel](https://github.com/NGPixel))*

### :wrench: Chores
- [`b78a335`](https://github.com/requarks/changelog-action/commit/b78a3354a01f4a1affb484b9264b506a815c46b1) - update dependencies + move to node 24 *(commit by [@NGPixel](https://github.com/NGPixel))*


## [v1.10.2] - 2024-04-25
### :bug: Bug Fixes
- [`6d71e09`](https://github.com/requarks/changelog-action/commit/6d71e098526ee17bae963f058d34cd763378337f) - add end of file return to changelog file *(PR [#56](https://github.com/requarks/changelog-action/pull/56) by [@sjpalf](https://github.com/sjpalf))*
  - :arrow_lower_right: *fixes issue [#54](https://github.com/requarks/changelog-action/issues/54) opened by [@leezero-carbon](https://github.com/leezero-carbon)*


## [v1.10.1] - 2024-02-06
### :bug: Bug Fixes
- [`4a2c34a`](https://github.com/requarks/changelog-action/commit/4a2c34a1a8fcfa9e48e61960aad0affc15066393) - incorrect related issue URL in file-based changelog output *(commit by [@NGPixel](https://github.com/NGPixel))*


## [v1.10.0] - 2024-01-16
### :sparkles: New Features
- [`6f10593`](https://github.com/requarks/changelog-action/commit/6f105938d7e03ad300949d064c6ccf739e79a3d0) - add changelogFilePath option *(PR [#44](https://github.com/requarks/changelog-action/pull/44) by [@kiyoon](https://github.com/kiyoon))*


## [v1.9.0] - 2023-09-26
### :sparkles: New Features
- [`dba389d`](https://github.com/requarks/changelog-action/commit/dba389d510fcf5b8327fe14221b569489dec425d) - add excludeScopes + restrictToTypes options *(commit by [@NGPixel](https://github.com/NGPixel))*

### :bug: Bug Fixes
- [`1fabc7b`](https://github.com/requarks/changelog-action/commit/1fabc7b0c6581d93c398246a856f084fb17cd9eb) - omit empty type exclusions *(commit by [@NGPixel](https://github.com/NGPixel))*


## [v1.8.2] - 2023-09-05
### :bug: Bug Fixes
- [`19f583f`](https://github.com/requarks/changelog-action/commit/19f583f53722c093319992282c8efb8a956efd64) - action.yml output name *(PR [#30](https://github.com/requarks/changelog-action/pull/30) by [@cupofme](https://github.com/cupofme))*
  - :arrow_lower_right: *fixes issue [#29](undefined) opened by [@cupofme](https://github.com/cupofme)*


## [v1.8.1] - 2023-06-12
### :bug: Bug Fixes
- [`cb9cac1`](https://github.com/requarks/changelog-action/commit/cb9cac16822feb7033a12db5731511e82f106d5c) - handle related PR issues query failures *(commit by [@NGPixel](https://github.com/NGPixel))*


## [v1.8.0] - 2023-04-18
### :sparkles: New Features
- [`a67af14`](https://github.com/requarks/changelog-action/commit/a67af14034e62802f8a8fa856a763a76d925df0d) - add support for GHE *(PR [#25](https://github.com/requarks/changelog-action/pull/25) by [@anden-dev](https://github.com/anden-dev))*
  - :arrow_lower_right: *addresses issue [#24](undefined) opened by [@anden-dev](https://github.com/anden-dev)*


## [v1.7.0] - 2023-03-17
### :sparkles: New Features
- [`01c1b24`](https://github.com/requarks/changelog-action/commit/01c1b24b234e079288271046481d408baad64656) - add reverseOrder option to list commits from newer to older *(commit by [@NGPixel](https://github.com/NGPixel))*

### :bug: Bug Fixes
- [`94af0c3`](https://github.com/requarks/changelog-action/commit/94af0c3dfeae6180da49e87ec06a24880614c081) - handle types in uppercase *(commit by [@NGPixel](https://github.com/NGPixel))*
- [`d47b63a`](https://github.com/requarks/changelog-action/commit/d47b63a7f846dd6c4aa803c597a12d413121fd59) - handle commits with no author info *(commit by [@NGPixel](https://github.com/NGPixel))*


## [v1.6.0] - 2022-12-15
### :sparkles: New Features
- [`f64e045`](https://github.com/requarks/changelog-action/commit/f64e045b5e7d73289888b92aa7cf6b9c8443f497) - include referenced issues from PRs *(commit by [@NGPixel](https://github.com/NGPixel))*


## [v1.5.0] - 2022-11-15
### :sparkles: New Features
- [`0192e0e`](https://github.com/requarks/changelog-action/commit/0192e0ed0553ee53648e187d784ccfdefe9e16b3) - add includeInvalidCommits option *(commit by [@NGPixel](https://github.com/NGPixel))*


## [v1.4.0] - 2022-11-15
### :sparkles: New Features
- [`a823d8a`](https://github.com/requarks/changelog-action/commit/a823d8ad176c08b3ceffaab28035dcc37be7f43e) - create changelog from 2 tags *(PR [#6](https://github.com/requarks/changelog-action/pull/6) by [@sitepark-veltrup](https://github.com/sitepark-veltrup))*

### :bug: Bug Fixes
- [`af145b6`](https://github.com/requarks/changelog-action/commit/af145b6f6d1fa8b857e497c91b3120cec8c1ef36) - move breaking changes section on top + update dependencies *(commit by [@NGPixel](https://github.com/NGPixel))*


## [v1.3.2] - 2022-05-06
### :bug: Bug Fixes
- [`66a4bf2`](https://github.com/requarks/changelog-action/commit/66a4bf2663a93f4271c97e78ec54859e0b40ff95) - empty changelog warning call *(commit by [@NGPixel](https://github.com/NGPixel))*


## [v1.3.1] - 2022-04-05
### :bug: Bug Fixes
- [`9c907a6`](https://github.com/requarks/changelog-action/commit/9c907a6f903e86d4591813cbf8c20b94797c7c70) - handle commits without PR attributions + issue ID mentions *(commit by [@NGPixel](https://github.com/NGPixel))*


## [v1.3.0] - 2022-04-01
### :sparkles: New Features
- [`7c89f7ab83`](https://github.com/Requarks/changelog-action/commit/7c89f7ab832998bbd4875c40b8b90a31aac1e398) - add type headers gitmoji option

## [v1.2.3] - 2022-03-31
### Bug Fixes
- [`7e675e563d`](https://github.com/Requarks/changelog-action/commit/7e675e563d4b3d6acbd444970ef9f8f13485b130) - use github native user handles when writeToFile is false

## [v1.2.2] - 2022-02-28
### Bug Fixes
- [`d6cd890415`](https://github.com/Requarks/changelog-action/commit/d6cd890415380a3392c700513b75145485d6c9b8) - compiled action dist

## [v1.2.1] - 2022-02-16
### Bug Fixes
- [`fc9dbce5d2`](https://github.com/Requarks/changelog-action/commit/fc9dbce5d2c2d9f2bb2a8160369c15017fda74e0) - fix: handle commits count over 250

## [v1.2.0] - 2022-02-12
### New Features
- [`3cf79dbbc9`](https://github.com/Requarks/changelog-action/commit/3cf79dbbc9c2343041681314f61f478e24191e4b) - add writeToFile option


## [v1.1.1] - 2022-02-03
### Bug Fixes
- [`22fe3e5bf2`](https://github.com/Requarks/changelog-action/commit/22fe3e5bf2205d243761cbfec6c7d5c90d897051) - ensure newline before footer links


## [v1.1.0] - 2022-01-22
### Bug Fixes
- [`de73e51a92`](https://github.com/Requarks/changelog-action/commit/de73e51a9227ef957d16ed17b22650582298ca7d) - use context + auto deploy workflow
- [`60fe502cb1`](https://github.com/Requarks/changelog-action/commit/60fe502cb1bbe8d74e3e1ed7540f636506c1d7c9) - precompiled build

[v1.1.0]: https://github.com/Requarks/changelog-action/compare/v1.0.0...v1.1.0
[v1.1.1]: https://github.com/Requarks/changelog-action/compare/v1.1.0...v1.1.1
[v1.2.0]: https://github.com/Requarks/changelog-action/compare/v1.1.1...v1.2.0
[v1.2.1]: https://github.com/Requarks/changelog-action/compare/v1.2.0...v1.2.1
[v1.2.2]: https://github.com/Requarks/changelog-action/compare/v1.2.1...v1.2.2
[v1.2.3]: https://github.com/Requarks/changelog-action/compare/v1.2.2...v1.2.3
[v1.3.0]: https://github.com/Requarks/changelog-action/compare/v1.2.3...v1.3.0

[v1.3.1]: https://github.com/requarks/changelog-action/compare/v1.3.0...v1.3.1
[v1.3.2]: https://github.com/requarks/changelog-action/compare/v1.3.1...v1.3.2
[v1.4.0]: https://github.com/requarks/changelog-action/compare/v1.3.2...v1.4.0
[v1.5.0]: https://github.com/requarks/changelog-action/compare/v1.4.0...v1.5.0
[v1.6.0]: https://github.com/requarks/changelog-action/compare/v1.5.0...v1.6.0
[v1.7.0]: https://github.com/requarks/changelog-action/compare/v1.6.0...v1.7.0
[v1.8.0]: https://github.com/requarks/changelog-action/compare/v1.7.0...v1.8.0
[v1.8.1]: https://github.com/requarks/changelog-action/compare/v1.8.0...v1.8.1
[v1.8.2]: https://github.com/requarks/changelog-action/compare/v1.8.1...v1.8.2
[v1.9.0]: https://github.com/requarks/changelog-action/compare/v1.8.2...v1.9.0
[v1.10.0]: https://github.com/requarks/changelog-action/compare/v1.9.0...v1.10.0
[v1.10.1]: https://github.com/requarks/changelog-action/compare/v1.10.0...v1.10.1
[v1.10.2]: https://github.com/requarks/changelog-action/compare/v1.10.1...v1.10.2
[v1.10.3]: https://github.com/requarks/changelog-action/compare/v1.10.2...v1.10.3
