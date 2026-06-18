# Verify webhook signatures

**Source:** https://mux.com/docs/_guides/core/verify-webhook-signatures

Obtain your signing secret

Before you get started, you will need your signing secret for your webhook. You can find that where you configure webhooks on the webhooks settings page. Please note that the signing secret is different for each webhook endpoint that we notify.

Webhooks contain a header called mux-signature with the timestamp and a signature. The timestamp is prefixed by t= and the signature is prefixed by a scheme. Schemes start with v, followed by an integer. Currently, the only valid signature scheme is v1. Mux generates signatures using HMAC with SHA-256.

```text
Mux-Signature: t=1565220904,v1=20c75c1180c701ee8a796e81507cfd5c932fc17cf63a4a55566fd38da3a2d3d2`
```


How to verify webhook signatures

Step 1: Extract the timestamp and signature

Split the header at the , character and get the values for t (timestamp) and v1 (the signature)

Step 2: Prepare the signed_payload string

You will need:
   the timestamp from Step 1 as a string (for example: "1565220904")
   the dot character .
  * the raw request body (this will be JSON in a string format)

Step 3: Determine the expected signature

Use the 3 components from Step 2 to compute an HMAC with the SHA256 hash function. Depending on the language that you are using this will look something like the following:


```js
secret = 'my secret' // your signing secret
payload = timestamp + "." + request_body
expected_signature = createHmacSha256(payload, secret)
```


Step 4: Compare signature

Compare the signature in the header to the expected signature. If the signature matches, compute the difference between the current timestamp and the received timestamp, then check to make sure that the timestamp is within our tolerance. By default, our SDKs allow a tolerance of 5 minutes.

Examples

Our official SDKs for Node and Elixir contain helper methods for verifying Mux webhooks. If you're using one of these languages it's best to use our available helper methods. Note that the helper methods use the raw request body instead of a payload including the timestamp.
