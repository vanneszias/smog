# README

**Source:** https://mux.com/docs/README

mux.com/docs

Developing

To set up your environment for testing docs, please see the root-level README.

If you're not a developer but want to contribute to our docs, we have a tutorial for non-technical contributors that walks through how to make changes using GitHub's web interface.

History

The marketing site and docs used to be separate repos. In 2025, the docs site joined the marketing site's Next.js project. We're working to gradually adopt more of the marketing site's patterns and components throughout the docs -- pardon the mess.

Code exclusive to docs lives in this apps/web/app/docs folder. Code shared by the two projects lives one level up, in the apps/web/app folder.

Creating new guides

Adding a new guide

1. Add a guide to the docs/_guides folder.
   > Guides are written in MDX, meaning you can write in Markdown, and you can include shiny components. (More on the components later)
2. Add the guide to the sidebar. The sidebar sections are defined in the docs/_config folder.
   > [!WARNING]
   > Any guide that is not in the sidebar will not display (unless it has its own docs/**/page.tsx file -- see spaces-to-livekit for example).

Using our shiny components

Want to add multiple code examples in a single block? Want to highlight some lines of your code example? Want to reuse one markdown file multiple times throughout your guides? Want to add a cool callout? We have components for those and _so much more_.

View docs/_guides/developer/example for info on the shiny components we have. You can also view that example guide at http://localhost:3000/docs/guides/example, once you have your dev server up and running.

Writing good guides

1. Be familiar with the Writing/voice guideline doc
2. Follow this example to get the tone & feel of how we write guides:

!Guide for Guides

Search

Search is powered by Algolia DocSearch. You can view the DocSearch dashboard here.

Login credentials

You can find the login credentials in 1Password (search for "Algolia DocSearch" in the DevEx Engineering vault).

Customizing the search results

We made some changes to the Algolia crawler settings using the editor in the Algolia dashboard. When you open the crawler editor, you'll see an actions entry. The real magic happens in the recordExtractor property. This function takes three items: a Cheerio instance (represented by a $), some custom Algolia helper functions, and the current URL being crawled.

Each page goes through this record extractor to determine which content appears in search results and its ranking priority. We customize this function to prioritize our guides over API references, API references over webhook references or changelogs. Different weights are assigned for this purpose.

We also use meta tags from our Next.js application to set content and product categories. For example, if a result is from the Mux Data product, we rank it lower than the Mux Video product because our video product might need more guidance for beginners.

The crawler goes through each record to find important elements and selectors for the search result. lvl0 through lvl3 are assigned different values that will show up in the search results. We always use a value of lvl2 for the type property for the best hierarchy appearance in the UI. Finally, we return all results to get the records configuration we need in Algolia DocSearch.

Recrawls are triggered by pushing to the main branch. See .github/workflows/recrawl_docs.yml for more details.

Links and Fix Broken Links

External links can be added to an .mdx guide like this: thisLink.

To submit a pull request for this branch, a script is run to check broken links. Before you push your branch to the remote, it's a good idea to run this first which will give a log of the links you need to fix.


```
npm run check-broken-links-including-external
```


Note that certain encoded URLs can set this off.

api-spec.json and webhook-spec.json

Any changes to the api spec or webhook spec should be submitted to the openapi-specification repo -- this repo is the source of truth for our Open API spec.

After changes have been merged into the main branch in that repo, follow these steps for updaing the public/api-spec.json file found in this repo:

1. Clone muxinc/openapi-specification locally. Pull down the latest main branch
1. On your local machine, openapi-specification and docs.mux.com should be in the same directory (they're siblings)
1. From openapi-specification run this command: npm install && npm run api:validate:full && cp dist/api-spec.json ../docs.mux.com/public/api-spec.json. This command will generate an api-spec.json file and then it will copy it into the docs.mux.com project to a file in public/api-spec.json
1. From openapi-specification run this command: npm run webhook:validate && cp dist/webhook-spec.json ../docs.mux.com/public/webhook-spec.json. This command will generate a webhook-spec.json file and then it will copy it into the docs.mux.com project to a file in public/webhook-spec.json
1. Submit a new PR for docs.mux.com with the changes

Spelling and Grammar Checks

> [!WARNING]
> Vale currently doesn't work. Sorryyyyyy

We use a tool called Vale to add spelling and grammar checks to our CI process. Every time you do a push to a branch in this repo, Vale runs the various guides through its spelling and grammar checks. To run them manually (especially before comitting), make sure you have Vale installed locally by running brew bundle (or manually by running brew install vale).

Once you have Vale installed, you can run vale sync to pull down the latest grammar packages locally, and then npm run spelling to run Vale against the documentation. It should report zero errors and zero warnings, like this:


```
$ npm run spelling
npm run v1.22.11
warning package.json: No license field
$ vale guides/ pages/ code-examples/ api-req-examples/
✔ 0 errors, 0 warnings and 0 suggestions in 132 files.
✨  Done in 0.79s.
```


If it does report an error, it will tell you on which line and column the error was found.

The most common errors are related to capitalization. If the system is complaining about jwplayer instead of JWPlayer, for example, and you really do mean to use jwplayer, simply place backticks () around the word to mark it as a string literal.

If you really need to add a word to our own custom dictionary, it can be added as a regular expression in vale_styles/Vocab/Docs/accept.txt`. It should be quite self-explanatory if you look at the other entries in that file. Please try to keep the entries in that file in alphabetical order.

If you have other questions or issues with the spell checking, please reach out to Justin or another member of the Devex Engineering team.
