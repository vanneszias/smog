# Use your own custom domain

**Source:** https://mux.com/docs/_guides/developer/use-a-custom-domain-for-streaming

Use your own domain name for live ingest

CNAME-ing, short for "Canonical Naming", is a configuration that allows you to change the default domain name we provide.

Add a CNAME to your domain's DNS settings, and configure it to point to global-live.mux.com. After a short amount of time you should be able use your own domain name for ingest.

Mux supports both RTMP, RTMPS and SRT ingestion. RTMP and SRT support custom domains by configuring the CNAME record to point at the relevant ingest URL's domain (such as global-live.mux.com, or a regional live ingest URL). Custom domains will not work with RTMPS.

Please reach out to our support team with additional details of your requirements.

Here are a few popular domain services with CNAME-ing instructions. If your domain service is not listed, try searching their support resources.

- Cloudflare
- Google Domains
- AWS Route 53
- GoDaddy

Note that the CNAME doesn't have to be global-live, it can be anything you want it to be.

After configuring your DNS settings it may take a few hours before the new configuration works, depending on your DNS provider.

Here are a few examples of RTMPS and RTMP CNAME URLs before and after they are changed to custom domains:


```text
# RTMPS examples
rtmps://global-live.mux.com:443/app
# RTMP examples
rtmp://global-live.mux.com:5222/app
rtmp://your-cname.your-site.com:5222/app
```


Use your own domain for delivering videos and images

For delivery, a custom domain allows you to play videos or deliver images from your domain rather than stream.mux.com or images.mux.com. Use your own domain for delivery, such as media.mycustomdomain.com

Why might you be interested in this feature? If you want to have a consistent brand presence across all your assets, sandbox your videos, or have a need to be allowlisted. If you are interested in this feature, please reach out to your Mux Account team.

Availability

Custom domains for playback is available for our customers with an annual contract with Mux. If you do not have an annual contract with Mux you can add-on this feature for the price of $100 per month. Please reach out to our Support Team to get set up.
