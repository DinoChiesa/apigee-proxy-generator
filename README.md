# Apigee Proxy Generator

This repo contains code and configuration that shows how to use a proxy-bundle
template and a configuration file to produce a facade API Proxy that connects to
an HTTP backend.

That's a lot of words, what does it mean?

The template is an "exploded" set of files that define an API Proxy bundle.
Each file is treated as a "template". At generation time, the tool applies a set
of configuration data (you might call it a "profile") to the template files. The
result is an actual proxy bundle, with all the template fields "filled in" by
the configuration or profile information.

## Limitations

This works only on Apigee X. It takes advantage of the GoogleAuthentication
feature that is available only in Apigee X.

## Generating Proxies via Templates

Templating in general is a useful technique. The idea is to combine a fixed set
of data (the template) with a variable set of data (the configuration? or the
data model) to produce something that is unique, and yet follows a formal
pattern. Performing this "combination" is sometimes described as _evaluating the
template against the data model_.

Templating is useful when producing Apigee proxies. A simple template approach
might be to fill in placeholder fields with values from the configuration
data. For example, when applying the template, a placeholder like `{{=
basepath}}` in a proxy template file would be replaced with the value of the
basepath property in the configuration data file. So, given this
template:

```
<ProxyEndpoint name="endpoint1">

  <HTTPProxyConnection>
    <BasePath>{{= basepath}}</BasePath>
  </HTTPProxyConnection>
  ...
```

And this configuration data:
```
 {
  "proxyname" : "flightdata",
  "basepath"  : "/flightdata",
  ...
```

The output would be:
```
<ProxyEndpoint name="endpoint1">

  <HTTPProxyConnection>
    <BasePath>/flightdata</BasePath>
  </HTTPProxyConnection>
  ...
```

When constructing API Proxies via templates, the template should the "boilerplate"
function that you want to be common to all proxies. This might be verifying required input
credentials, standard fault handling, maybe rate limiting, and so on.

Rather than considering a single file as the template, with Apigee, the exploded
proxy _bundle_ can be the template, and the act of evaluating the template would
apply the data iteratively over each file in the bundle.

Static placeholder replacement is handy but limited. You can't use static
templating to construct proxies that have varying numbers of conditional
flows. With static templating, you can't conditionally include segments of the
template. To address that limitation, most modern templating engines have more
dynamic capabilities.

This demonstration tool uses
[nodejs](https://nodejs.org/en/) and the
[lodash](https://lodash.com/docs/4.17.15#template) package for templating, which
includes capabilities like looping, conditionals, and arbitrary JavaScript
logic. This gives much more flexibility in what the template can do.

For example, a template can include logic that would:

- loop through a set of "flows" listed in the configuration data
- emit a unique Flow element in the generated ProxyEndpoint for each one
- emit a distinct set of policy files to be embedded in each distinct Flow
- conditionally emit _some_ policies in some flows.
- and so on.

This is starting to get interesting!

The tool in this repo that applies the template is generic. The template itself
and the configuration that gets applied, can vary, for different purposes. There
are a few example templates here, and a few different configurations.  But these
are intended to be illustrations. You could write your own templates and your
own configuration data, too.

I hope you will be able to re-use the tool and the technique. 

## Why use a Template?

Writing a template, and then separating out configuration data from that
template, is more complicated than just writing the configuration for an API
proxy, directly. So why do it? Why go to the trouble?

A couple reasons you'd want to write a template and "genericize" the proxy bundle:

1. If you have a number of different data sources or data sets, and want to
   produce similarly-structured API proxies across those data sets, minimizing
   repetitive effort.

2. If the people who maintain Apigee, the API platform, are different than the
   people who publish the Data APIs. The former group knows ProxyEndpoints,
   Flows, and context variables. The latter group knows SQL and database tables
   and views. You don't want to cross train them.

In either of these cases, you might want to take the extra effort
to employ templates for your API proxy generation.


## Example Templates Included here

There are two templates [included here](./templates):

1. [**BigQuery Facade Proxy**](./templates/bq-simple-proxy-template)

   This is a simple facade proxy for queries against BigQuery.  The generated
   proxy exposes a curated set of queries against BQ, each one as a different
   flow in the proxy endpoint. The target is bigquery.googleapis.com .

   This example shows how you can generate numerous different
   simple facade proxies against different BQ datasets, with specific,
   possibly parameterized queries for each one.

2. [**BigQuery Rate Limiting Proxy**](./templates/bq-rate-limiting-proxy-template)

   This is an extension of the above. The basic idea is the same: it's a facade
   for curated BQ queries. But, this one uses the Apigee builtin Quota policy,
   with the `EnforceOnly` and `CountOnly` features on the request flow and the
   response flow respectively, to enforce a rate limit.  The `CountOnly` uses a
   `MessageWeight` that is dynamically determined from the `totalSlotMs` of the
   BQ Query.

   This example uses an `account-num` request header as the Quota identifier.
   In a real system, that should be replaced with an Application ID, or Partner
   ID, etc, as appropriate.

You could create other proxy templates. The templates you create don't need to
point to BigQuery.

## Example Configuration Data 

There are 3 distinct configurations here: 

1. [**flights**](./data/config-bq-flights.json)

   Queries the airline flights sample dataset in BQ. 
   
2. [**open-images**](./data/config-bq-open-images.json)

   Queries the open images public dataset in BQ. 
   
3. [**covid19**](./data/config-bq-covid19.json)

   Queries two different public datasets in BQ related to Covid19. 


Have a look at the open-images configuration. It's quite simple: 
```json
{
  "proxyname" : "openimages",
  "basepath"  : "/openimages",
  "projectId" : "infinite-chain-292422",
  "flows" : [
    {
      "name" : "images-by-keyword",
      "path" : "/images-by-keyword/*",
      "query" : "SELECT original_url, title FROM [bigquery-public-data.open_images.images] where title like '%{param1}%' LIMIT 50"
    }
  ]
}
```

There are four top-level properties. All should be self-explanatory. 
In this configuration, there is just one element within the flows array property. It defines the 
information needed for a specific conditional flow, including the path pattern, and the query. 

You could add more flows by inserting additional elements with distinct queries and path patterns. 

## Using the example tool

The [proxy generator tool](./tools/genProxyFromTemplate.js) included here does these things: 

- generates the templatized proxy, by combining a template against a specific configuration. 

- import & deploy the proxy, to the given organization + environment, with the specified service account. 


You'll need a recent version of node and npm to run this tool.

1. First, Create service account

   Create a service account that the proxy will "Act as" in order to query BigQuery.
   This account will need the "Big Query Job User" role in the GCP project.

   You do not need to create or download a service-account key.
   **NB**: This example works only against Apigee X, and depends on a feature particular
   to Apigee X. 

   You can use the [GCP cloud console UI](https://console.cloud.google.com), or
   the [gcloud command-line tool](https://cloud.google.com/sdk/gcloud), to do
   this.


2. Generate a proxy, and import & deploy it.

   This shows how to generate a Data API proxy for the "flights" data from the
   "simple" BQ facade template.

   ```
   cd tools
   npm install

   # set shell variables
   TOKEN=$(gcloud auth print-access-token)
   SVCACCT=bq-reader@$PROJECT.iam.gserviceaccount.com
   ORG=whatever
   ENV=your-env

   ## generate, import and deploy
   node ./genProxyFromTemplate.js -v \
     --token $TOKEN \
     --apigeex \
     --org $ORG \
     --env $ENV \
     --source ../templates/bq-simple-proxy-template \
     --config ../data/config-bq-flights.json \
     --serviceaccount $SVCACCT 
   ```

   Note: if you do not specify the `--env` option, the tool will import the
   generated proxy bundle to your organization, but won't deploy it.

3. Invoke some queries
   ```
   endpoint=https://my-apigeex-endpoint.net
   curl -i $endpoint/flightdata/airlines32
   curl -i $endpoint/flightdata/airlines100
   curl -i $endpoint/flightdata/airports/SEA/counts/2008-05-13
   curl -i $endpoint/flightdata/airports/LGA/counts/2010-02-11
   ```

## For the Rate Limiting Proxy

You can generate, import, and deploy the rate-limiting proxy like this:

```sh
node ./genProxyFromTemplate.js -v \
  --token $TOKEN \
  --apigeex \
  --org $ORG \
  --env $ENV \
  --source ../templates/bq-rate-limiting-proxy-template \
  --config ../data/config-bq-flights.json \
  --serviceaccount $SVCACCT 
```

The rate limiting is hard-coded to 5000 "totalSlotMs units" per hour.

The proxy uses the `account-num` request header as the Quota identifier. When
you invoke it, pass that header.  Any value will do:

```sh
curl -i -H account-num:A1234567 $endpoint/flightdata/airlines100
curl -i -H account-num:A1234567 $endpoint/flightdata/airports/LGA/counts/2010-02-14
curl -i -H account-num:A1234567 $endpoint/flightdata/airports/EWR/counts/2010-02-14
```

For those last two queries, you can see the URL path includes parameters. The first
positional param is a 3-letetr airport code. Try LGA, EWR, SEA, SJC, SFO, and so
on.  The latter field is a date. This flight data is old, so you can use dates
in the 2008-2011 range, I think. The format is YYYY-MM-DD.

If you invoke enough _unique_ queries, you will see a 429 response when the Quota
is exceeded. BQ will respond from cache when you send the same query repeatedly,
and those requests do not result in decrementing from the Quota count.

## Generate only

To only generate the proxy, without importing and deploying it, specify the `--generateonly` option:

```sh
node ./genProxyFromTemplate.js \
    --generateonly \
    --source ../templates/bq-simple-proxy-template \
    --config ../data/config-bq-flights.json
```

The result will be an API Proxy bundle zip.

## Extending This Demonstration

You can build your own proxy templates. They do not need to connect to
BigQuery. Use your imagination!

## License

This material is [Copyright 2018-2022 Google LLC](./NOTICE).
and is licensed under the [Apache 2.0 License](LICENSE). This includes the nodejs
code as well as the API Proxy configuration.

## Disclaimer

This example is not an official Google product, nor is it part of an
official Google product.


## Author

Dino Chiesa  
godino@google.com

## Bugs

- ??
