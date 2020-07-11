# honeycomb-apollo

This is an extension for the [Apollo GraphQL server](https://www.apollographql.com/docs/apollo-server/) that automatically traces and annotates all of your resolvers.

## Getting started

This assumes you already have configured Honeycomb in your application.

Install:

`npm i honeycomb-apollo`

Import:

`import { honeycombTracingPlugin } from'honeycomb-apollo';`

Add as a plugin:

```typescript
const server = new ApolloServer({
  plugins: [
    honeycombTracingPlugin(),
  ],
```

And you're good to go!

# Thanks to

 - [Ally Weir](https://gist.github.com/allyjweir)
 - Marco Rogers
 - Everyone in the Pollinators Slack
