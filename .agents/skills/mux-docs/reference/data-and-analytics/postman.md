# Make API requests with Postman

**Source:** https://mux.com/docs/_guides/core/postman

We recommend Postman as a way to easily explore and interact with our API.

Similar to forking a repository on GitHub, forking a collection on Postman allows you to create a new instance of the collection.
Here, you can send requests, collaborate, and submit changes to the original collection.
Without forking the collection, the collection will be read-only and you will not be able to make requests unless you're a member of the workspace — even if the collection is public.

If you're already a Postman user, you can fork our officially supported Postman collection and add it to your workspace by clicking the button below.

You can then stay up to date with future changes to our API specification by pulling changes. More on that in the sections below.

![Run in Postman](https://god.gw.postman.com/run-collection/18282356-97f1767e-f35a-4fca-b1c5-bf612e6f8e76?action=collection%2Ffork&collection-url=entityId%3D18282356-97f1767e-f35a-4fca-b1c5-bf612e6f8e76%26entityType%3Dcollection%26workspaceId%3D2bcc854d-f831-4c9f-ac0a-3b4382f3a5cd)

| Term         | Description                                                |
| :----------- | :--------------------------------------------------------- |
| Token ID     | access token ID, the "username" in basic auth              |
| Token secret | access token secret key, the "password" in basic auth      |

Set up credentials

Once you've created your access tokens via your Mux account, you can input them into their respective fields under authorization.

<Image
  src="/docs/images/postman-auth.png"
  width={1217}
  height={723}
  alt="Basic authentication in Postman"
/>

Environment variables

You can use environment variables to store and reuse values — like your credentials —
across requests and collections. Variables can either be scoped to the environment or globally, available to all collections within a workspace.

To create environment variables, click the eye icon on the right-hand side of the collection and choose the scope you want your credentials to apply to.

<Image
  src="/docs/images/postman-env-variables.png"
  width={1217}
  height={723}
  alt="Environment variables menu in Postman"
/>

Next, add your credentials and set the type to secret. This will hide values on-screen. Once you've finished setting up your environment variables,
you can go back to basic authentication and use the variables instead of the values directly. To do this, use {{variable_name}} in the form field.

<Image
  src="/docs/images/postman-hidden-auth.png"
  width={1217}
  height={723}
  alt="Hidden authentication in Postman"
/>

Even with extensive documentation, it can be hard to navigate an API for the first time. To help you make requests and understand their responses, we use Postman's
examples feature for all Mux Video and Mux Data endpoints.

You can view an endpoint's sample request body by clicking the endpoint on the left-hand API menu and then clicking body in the main section of the interface.

<Image
  src="/docs/images/postman-sample-request-body.png"
  width={1217}
  height={723}
  alt="Sample API request body in Postman"
/>

You can view an endpoint's sample request response by clicking the right-facing carat on the endpoint. A new item will appear in the collection with the icon e.g..

<Image
  src="/docs/images/postman-sample-request-response.png"
  width={1217}
  height={523}
  alt="Sample API request response in Postman"
/>

Similar to a forked repository on GitHub, your Postman fork will only stay up to date with the origin collection if you periodically pull changes
to keep your fork in sync.

You can pull changes by clicking the three dots next to the name of your fork. This will open a sub-menu. Click on merge changes near the bottom of the menu.

<Image
  src="/docs/images/postman-fork-sub-menu.png"
  width={517}
  height={123}
  alt="Forked Postman collection's sub-menu"
/>

If your fork is not in sync with the origin collection, there will be a yellow banner that states, "The destination has been modified since you last updated the fork. We’d recommend pulling changes." Click pull changes on the right.

You will then see a diff where source is the origin and destination is your fork.

<Image
  src="/docs/images/postman-pull-changes-diff.png"
  width={617}
  height={323}
  alt="API diff when pulling changes"
/>

Sometimes there will be merge conflicts. If you encounter them, you can choose whether you keep the source or destination version of a change.

Once everything looks good, click the orange button labeled pull changes.
