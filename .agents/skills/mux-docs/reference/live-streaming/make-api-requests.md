# Make API requests

**Source:** https://mux.com/docs/_guides/core/make-api-requests

| Term         | Description                                            |
| :----------- | :----------------------------------------------------- |
| Token ID     | access token ID, the "username" in HTTP basic auth     |
| Token secret | access token secret, the "password" in HTTP basic auth |

Every request to the API is authenticated via an Access Token, which includes the ID and the secret key. You can think of the Access Token’s ID as its username and secret as the password. Mux only stores a hash of the secret, not the secret itself. If you lose the secret key for your access token, Mux cannot recover it; you will have to create a new Access Token. If the secret key for an Access Token is leaked you should revoke that Access Token on the settings page: https://dashboard.mux.com/settings/access-tokens.

Note that in order to access the settings page for access tokens you must be an admin on the Mux organization.

API requests are authenticated via HTTP Basic Auth, where the username is the Access Token ID, and the password is the Access Token secret key. Due to the use of Basic Authentication and because doing so is just a Really Good Idea™, all API requests must made via HTTPS (to https://api.mux.com).

  Access tokens are scoped to an environment, for example: a development token cannot be used in requests to production. Verify the intended environment when creating an access token.

This is an example of authenticating a request with cURL, which automatically handles HTTP Basic Auth. If you run this request yourself it will not work, you should replace the Access Token ID (44c819de-4add-4c9f-b2e9-384a0a71bede) and secret (INKxCoZ+cX6l1yrR6vqzYHVaeFEcqvZShznWM1U/No8KsV7h6Jxu1XXuTUQ91sdiGONK3H7NE7H) in this example with your own credentials.


```shell
curl https://api.mux.com/video/v1/assets \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{ "inputs": [{ "url": "https://muxed.s3.amazonaws.com/leds.mp4" }], "playback_policies": ["public"], "video_quality": "basic" }' \
  -u 44c819de-4add-4c9f-b2e9-384a0a71bede:INKxCoZ+cX6l1yrR6vqzYHVaeFEcqvZShznWM1U/No8KsV7h6Jxu1XXuTUQ91sdiGONK3H7NE7H
```


HTTP basic auth works by base64 encoding the username and password in an Authorization header on the request.

Specifically, the header looks something like this:


```bash
'Authorization': 'Basic base64(MUX_TOKEN_ID:MUX_TOKEN_SECRET)'
```


1. The access token ID and secret are concatenated with a : and the string is base64 encoded.
1. The value for the Authorization header is the string Basic plus a space   followed by the base64 encoded result from Step 1.

In the cURL example above, the cURL library is taking care of the base64 encoding and setting the header value internally. The HTTP library you use in your server-side language will probably have something similar for handling basic auth. You should be able to pass in the username (Access Token ID) and password (Access Token secret) and the library will handle the details of formatting the header.

  If you're just getting started with Mux Video, use Read and Write.

If you are creating or modifying resources with Mux Video then you need Read and Write permissions. This includes things like:

- Creating new assets
- Creating direct uploads
- Creating new live streams

If you need to create signed tokens for secure video playback, your access token needs System write permissions. Learn more about secure video playback and signing keys.

Mux Data only requires Write permissions if you need to create Annotations via API. Annotations created in the Dashboard do not require Write permissions.

<Image
  src="/docs/images/new-access-token.png"
  width={760}
  height={376}
  alt="Mux access token permissions"
  sm
/>

If your code is not creating anything and only doing GET requests then you can restrict the access token to Read only.

Mux API endpoints do not have CORS headers, which means if you try to call the Mux API from the browser you will get an error:

  request has been blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.

This is expected. Although making API requests directly from the browser or your mobile app would be convenient, it leaves a massive security hole in your application by the fact that your client side code would contain your API keys. Anyone who accesses your application would have the ability to steal your API credentials and make requests to Mux on your behalf. An attacker would be able to gain full control of your Mux account.

Mux API Credentials should never be stored in a client application. All Mux API calls should be made from a trusted server.

Instead of trying to make API requests from the client, the flow that your application should follow is:

1. Client makes a request to your server
1. Your server makes an authenticated API request to Mux
1. Your server saves whatever it needs in your database
1. Your server responds to the client with only the information that the client needs. For example, with live streaming that's the stream key for a specific stream, for uploads that's just the direct upload URL

Serverless functions are a great way to add pieces of secure server-side code to your client heavy application. Examples of services that help you run serverless functions are:

- AWS Lambda
- Firebase Cloud Functions
- Cloudflare Workers
- Vercel Functions
- Netlify Functions

The basic idea behind serverless functions is that you can write a bit of server code and deploy it to run on these platforms. Your client application can make requests to these endpoints to perform specific actions. Below is an example from with-mux-video of a serverless function endpoint that makes an API call to create a Mux Direct Upload.


```js
// pages/api/upload.js
// see: https://github.com/vercel/next.js/tree/canary/examples/with-mux-video
import Mux from '@mux/mux-node';

const mux = new Mux();

export default async function uploadHandler(req, res) {
  const { method } = req;

  switch (method) {
    case 'POST':
      try {
        const upload = await mux.video.uploads.create({
          new_asset_settings: { playback_policy: ['public'], video_quality: 'basic' },
          cors_origin: '*',
        });
        res.json({
          id: upload.id,
          url: upload.url,
        });
      } catch (e) {
        console.error('Request error', e);
        res.status(500).json({ error: 'Error creating upload' });
      }
      break;
    default:
      res.setHeader('Allow', ['POST']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}
```


Our list endpoints (such as List Assets) do not return every single relevant record.
To offer everyone the best performance we limit the amount of records you can receive and offer pagination parameters to help you navigate through your list.

Page/limit pagination
Our most common pagination controls are page and limit.

| Parameter | Default | Maximum | Description                                      |
| :-------- | :------ | :---- | :--------------------------------------------------|
| page    | 1     | None | The page number to return. The first page is 1.   |
| limit   | 10    | 100 | The number of records to return per page.          |

If you have 100 assets and you want to get the first 10, you would make a request like this:


```http
GET /video/v1/assets?page=1&limit=10
```


And if you want to get the next 10, you would increment the page parameter from 1 to 2 and make a request like this:


```http
GET /video/v1/assets?page=2&limit=10
```


Cursor pagination
In addition to page/limit, the List Assets endpoint also supports cursor pagination.
Cursor pagination is a more efficient and reliable way of paginating through very large collections.

Cursor pagination is only available on the List Assets endpoint, but we plan to add it to more endpoints in the future. If you want it added to any specific endpoints please let us know!

When you make a request to the list assets endpoint we return a next_cursor value.


```json
// GET /video/v1/assets
{
  "data": [
    {
      "id": "asset_id",
      "status": "ready",
      ...
    }
  ],
  "next_cursor": "eyJwYWdlX2xpbWl0IjoxMDAwLCJwYWdlX2NvdW50IjoxfQ"
}
```


Take that next_cursor value and make a new request to the list assets endpoint with the cursor parameter.


```json
// GET /video/v1/assets?cursor=eyJwYWdlX2xpbWl0IjoxMDAwLCJwYWdlX2NvdW50IjoxfQ
{
  "data": [
    {
      "id": "asset_id",
      "status": "ready",
      ...
    }
  ],
  "next_cursor": null
}
```


If next_cursor is null, you've reached the end of your list. If next_cursor is not null you can use that value to get the next page, repeating this pattern until next_cursor is null.

Mux Video implements a simple set of rate limits. Rate limits are set per account (not per environment). These rate limits exist for two reasons:

1. First, to protect you, or customers from runaway scripts or batch process - we don't want you to accidentally delete all your content, or run up a large bill if you're not expecting it.
1. Second, to ensure that there's always Mux infrastructure available when our customers need it, for example to start that critical live stream, or ingest that urgent video.

When the rate limit threshold is exceeded, the API will return a HTTP status code 429.

Video API

1. All Video API activities that include a POST request to https://api.mux.com/video/ are rate limited to a sustained 1 request per second (RPS) with the ability to burst above this for short periods of time. This includes creating new Assets, Live Streams, and Uploads.

1. All other request methods are limited to 5 sustained requests per second (RPS) with the ability to burst above this for short periods of time. This includes GET, PUT, PATCH, & DELETE verbs. Examples include (but not limited to) requests for retrieving an asset, updating mp4 support, & listing delivery usage.

Playback

There are no limits as to the number of viewers that your streams can have, all we ask is that you let us know if you're planning an event expected to receive more than 100,000 concurrent live viewers.

Monitoring Data API

Requests against the Monitoring Data APIs are rate limited to a sustained 1 request per second (RPS) with the ability to burst above this for short periods of time.

General Data API

Requests against the all other General Data APIs are rate limited to a sustained 5 request per second (RPS) with the ability to burst above this for short periods of time.

OpenAPI specification

The complete Mux API is described by an OpenAPI specification, available at https://www.mux.com/api-spec.json. You can use this spec to generate API clients, import endpoints into tools like Postman, or integrate with any tooling that supports OpenAPI.
