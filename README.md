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

## Templating via lodash

A simple "template" approach might be to fill in marker fields with values from
configuration.  For example, the marker like `{{= basepath}}` in a proxy
configuration file could be replaced with the value of the basepath property in
the configuration. For example, given this template: 

```
<ProxyEndpoint name="endpoint1">

  <HTTPProxyConnection>
    <BasePath>{{= basepath}}</BasePath>
  </HTTPProxyConnection>
  ...
```

And this data: 
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

This kind of static replacement is handy but limited.

Rather than just use static field replacement, this demonstration uses nodejs
and the lodash package for templating. This means each file in the API proxy
bundle "template" can go well beyond static field replacement to include
looping, conditionals, and arbitrary JavaScript logic. This gives much more
flexibility in what the template can do.

For example, a template can include logic that would:

- loop through a set of "flows" listed in the configuration data
- emit a unique Flow element in the generated ProxyEndpoint for each one
- emit a distinct set of policy files to be embedded in each distinct Flow
- conditionally emit _some_ policies in some flows.
- and so on.

In this example, the tool that applies the template is generic.  The template
itself and the configuration that gets applied, can vary, for different
purposes. There are a few example templates here, but you could write your
own. And of course you can write your own configuration data, too.

## Why use a Template? 

Writing a template, and then separating out configuration data from that
template, is more complicated than just writing the configuration for an API
proxy, directly.  So why do it? Why go to the trouble?

The reason you'd want to write a template and "genericize" the proxy bundle, is
if you have a number of different data sources or data sets, and want to produce
similarly-structured API proxies across those data sets, then you might want to
use a template for that purpose.


## Example Templates Included here

There are two templates included here: 

1. *BigQuery Facade Proxy*

   This is a simple facade proxy for queries against BigQuery. 
   The generated proxy
   exposes a curated set of queries against BQ, each one as a different
   flow in the proxy endpoint. The target is bigquery.googleapis.com . 

   This example shows how you can generate numerous different 
   simple facade proxies against different BQ datasets, with specific, 
   possibly parameterized queries for each one. 

2. *BigQuery Rate Limiting Proxy*

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

## Using the examples

You will generate the templatized proxy, and then import/deploy the proxy, all
in one step. Use the bundled tool to do so.

You need a recent version of node and npm to run this tool. 

1. First, Create service account  
   Create a service account that the proxy will "Act as" in order to query BigQuery. 
   This account will need the "Big Query Job User" role in the GCP project.

   You do not need to create or download a service-account key. 
   (This works only against Apigee X)
   
   You can use the console.cloud.google.com UI , or the gcloud tool, to do this. 
   
   
2. Generate a proxy, and import & deploy it.   
   This shows how to generate a  proxy from the "simple" BQ facade template.

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
     --serviceaccount $SVCACCT \
   ```
   
   Note: if you do not specify the environment, the tool will import the
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
  --serviceaccount $SVCACCT \
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

If you invoke enough unique queries, you will see a 429 response when the Quota
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

You can build your own proxy templates.  They do not need to connect to
BigQuery. Use your imagination!


## License

This material is [Copyright 2018-2022 Google LLC](./NOTICE).
and is licensed under the [Apache 2.0 License](LICENSE). This includes the nodejs
code as well as the API Proxy configuration.

## Disclaimer

This example is not an official Google product, nor is it part of an
official Google product.


## Bugs

- ??
