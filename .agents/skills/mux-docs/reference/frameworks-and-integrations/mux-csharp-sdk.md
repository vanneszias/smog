# Add high-performance video to your C# application

**Source:** https://mux.com/docs/_guides/integrations/mux-csharp-sdk

Frameworks supported
- .NET Core >=1.0
- .NET Framework >=4.6
- Mono/Xamarin >=vNext

Dependencies

- RestSharp - 106.11.4 or later
- Json.NET - 12.0.3 or later
- JsonSubTypes - 1.7.0 or later
- System.ComponentModel.Annotations - 4.7.0 or later

The DLLs included in the package may not be the latest version. We recommend using NuGet to obtain the latest version of the packages:

```
Install-Package RestSharp
Install-Package Newtonsoft.Json
Install-Package JsonSubTypes
Install-Package System.ComponentModel.Annotations
```


NOTE: RestSharp versions greater than 105.1.0 have a bug which causes file uploads to fail. See RestSharp742

Installation
Generate the DLL using your preferred tool (e.g. dotnet build)

Then include the DLL (under the bin folder) in the Cproject, and use the namespaces:

```csharp
using Mux.Csharp.Sdk.Api;
using Mux.Csharp.Sdk.Client;
using Mux.Csharp.Sdk.Model;
```


Usage

At this moment, this SDK is not suitable for parsing or modeling webhook payloads, due to some incompatibilities in our API spec and our SDK generation tooling. We are working on resolving these issues, but for now you should only use this SDK for Mux's REST APIs.

To use the API client with a HTTP proxy, setup a System.Net.WebProxy

```csharp
Configuration c = new Configuration();
System.Net.WebProxy webProxy = new System.Net.WebProxy("http://myProxyUrl:80/");
webProxy.Credentials = System.Net.CredentialCache.DefaultCredentials;
c.Proxy = webProxy;
```


Getting Started


```csharp
using System.Collections.Generic;
using System.Diagnostics;
using Mux.Csharp.Sdk.Api;
using Mux.Csharp.Sdk.Client;
using Mux.Csharp.Sdk.Model;

namespace Example
{
    public class Example
    {
        public static void Main()
        {

            Configuration config = new Configuration();
            config.BasePath = "https://api.mux.com";
            // Configure HTTP basic authorization: accessToken
            config.Username = "YOUR_USERNAME";
            config.Password = "YOUR_PASSWORD";

            var apiInstance = new AssetsApi(config);
            var createAssetRequest = new CreateAssetRequest(); // CreateAssetRequest |

            try
            {
                // Create an asset
                AssetResponse result = apiInstance.CreateAsset(createAssetRequest);
                Debug.WriteLine(result);
            }
            catch (ApiException e)
            {
                Debug.Print("Exception when calling AssetsApi.CreateAsset: " + e.Message );
                Debug.Print("Status Code: "+ e.ErrorCode);
                Debug.Print(e.StackTrace);
            }

        }
    }
}
```


Full documentation
Check out the Mux CSDK docs for more information.
