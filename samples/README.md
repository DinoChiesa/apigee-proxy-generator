# Sample tool

This directory contains a tool to help you test out single-file templates.

In some cases, building an exploded API Proxy template can be a daunting.
If you are not clear how the flows in the data file are being interpreted
by the template expander, you can use this tool to iteratively test your
work.


## Using the sample templates

The [first example template](./flows-template-1.txt) here is like so:
```
  {{
   flows.forEach( (flow,ix) => {
  }}

  flow {{= ix}} : {{= flow.name}}

  {{
   });
  }}
```

It emits just the number, and the flow.name, for each item in the source data, aka configuration data.


Try it out:

```
node ../tools/expandOneFile.js --config ./flows-data.json --templatefile ./flows-template-1.txt
```

You should see as output:
```
result:


  flow 0 : read-pet



  flow 1 : list-pets



  flow 2 : create-pet


```


The [second example template](./flows-template-2.txt) here is a little more
elaborate. It refers to multiple fields in the source data, beyond just
`flow.name`.  It looks like this:

```
  {{
   flows.forEach( (flow,ix) => {
  }}

  <Flow name="{{= flow.name}}">
     <Description>{{= flow.description}}</Description>
     <Request/>
     <Response/>
     <Condition>(proxy.pathsuffix MatchesPath "{{= flow.path}}") and (request.verb = "{{= flow.verb}}")</Condition>
  </Flow>
  {{
   });
  }}
```


Try it:

```
node ../tools/expandOneFile.js --config ./flows-data.json --templatefile ./flows-template-2.txt
```

The result is a little more elaborate:

```
  <Flow name="read-pet">
     <Description>Read one Pet, by ID</Description>
     <Request/>
     <Response/>
     <Condition>(proxy.pathsuffix MatchesPath "/pets/{petid}") and (request.verb = "GET")</Condition>
  </Flow>


  <Flow name="list-pets">
     <Description>list all available Pets</Description>
     <Request/>
     <Response/>
     <Condition>(proxy.pathsuffix MatchesPath "/pets") and (request.verb = "GET")</Condition>
  </Flow>


  <Flow name="create-pet">
     <Description>create a new pet</Description>
     <Request/>
     <Response/>
     <Condition>(proxy.pathsuffix MatchesPath "/pets") and (request.verb = "POST")</Condition>
  </Flow>

```

You can use this tool to try out your own templates , as you iterate on them.
