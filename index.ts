import { GraphQLRequestContext } from 'apollo-server-core/dist/requestPipelineAPI';
import beeline from 'honeycomb-beeline';
import {
  ResponsePath,
  GraphQLOutputType,
  GraphQLCompositeType,
} from 'graphql';
import { ApolloServerPlugin } from 'apollo-server-plugin-base';

const responsePathArray = (rp: ResponsePath): (string | number)[] => {
  const path = [rp.key];
  while (rp.prev) {
    rp = rp.prev;
    path.unshift(rp.key);
  }
  return path;
};

const responsePathAsString = (rp: ResponsePath) => {
  return responsePathArray(rp).join('.');
};
const parentResponsePathAsString = (rp: ResponsePath): string => {
  return responsePathArray(rp).slice(0, -1).join('.');
};
const parentResponsePathAsNumberlessString = (rp) => {
  const rpa = responsePathArray(rp).slice(0, -1);
  if (typeof rpa[rpa.length - 1] === 'number') {
    return rpa.slice(0, -1).join('.');
  }
  return rpa.join('.');
};
const getRootQuery = (rp: ResponsePath) => {
  while (rp.prev) {
    rp = rp.prev;
  }
  return rp.key;
}

const generateResolverCtx = (path: ResponsePath, returnType: GraphQLOutputType, parentType: GraphQLCompositeType) => {
  const fieldResponsePath = responsePathAsString(path);
  const context = {
    name: fieldResponsePath,
    type: 'graphql_field_resolver',
    'graphql.parent_type': parentType.toString(),
    'graphql.parent_path': parentResponsePathAsString(path),
    'graphql.type': returnType.toString(),
    'graphql.field_path': fieldResponsePath,
    'graphql.query': getRootQuery(path),
  };

  const id = path && path.key;
  if (path && path.prev && typeof path.prev.key === 'number') {
    context['graphql.field_name'] = `${path.prev.key}.${id}`;
  } else {
    context['graphql.field_name'] = id;
  }

  return context;
}

interface HoneycombTracingPluginOptions {
  deep?: boolean;
}

export const honeycombTracingPlugin = ({ deep }: HoneycombTracingPluginOptions = {}) => (): ApolloServerPlugin => ({
  requestDidStart(requestContext: GraphQLRequestContext) {
    // Generally, we'll get queryString here and not parsedQuery; we only get
    // parsedQuery if you're using an OperationStore. In normal cases we'll get
    // our documentAST in the execution callback after it is parsed.
    const queryString = requestContext.request.query;
    const rootSpan = beeline.startSpan({ name: 'graphql_query' });
    rootSpan.addContext({ 'graphql.query_string': queryString });

    return {
      executionDidStart: ({ operationName }) => {
        // If the operationName is explicitly provided, save it. If there's just one
        // named operation, the client doesn't have to provide it, but we still want
        // to know the operation name so that the server can identify the query by
        // it without having to parse a signature.
        rootSpan.addContext({ 'graphql.operation_name': operationName });

        return {
          executionDidEnd: () => {
            // not sure if we need this?
            // or finish the span here?
          },
          willResolveField: ({ info }) => {
            if (!deep) {
              return;
            }
            // TODO: figure out if we can manually set parentId here

            /**
             * THINGS GET WEIRD HERE FOR GRAPHQL/APOLLO-RELATED REASONS
             *
             * Apollo's going to fire off a bunch of resolvers all at once.  Seems like it'll go everywhere always.
             * We want to create a new span every time a resolver kicks, to track that resolver.
             * *but* that causes problems with lineage.  Turns out parent span is "whatever span is running when you created the span"
             * That's no good, for several reasons:
             * Since Apollo's kicking everything everywhere, parentage isn't guaranteed to be related.
             * Also, when a parent span is finished, if there are unfinished child spans, they're all dropped on the floor.
             * (cite: https://honeycombpollinators.slack.com/archives/CLMLJ7CDV/p1588972235038700)
             * So if one one resolver finishes, it might have been the "parent" of an unrelated resolver.  The child spans all get closed.
             *
             * Instead, we start an Async span, since those don't implicitly become children of the current span
             */
            return beeline.startAsyncSpan(generateResolverCtx(info.path, info.returnType, info.parentType), span => {
              let res;
              new Promise(resolve => {
                res = resolve;
              })
                .then((err?: Error) => {
                  if (err) {
                    beeline.addTraceContext({ error: err.message });
                  }
                  beeline.finishSpan(span);
                });

              return res;
            });
          }
        };
      },
      willSendResponse: () => {
        // Now we're done
        // TODO: Verify all spans have closed
        beeline.finishSpan(rootSpan);
      }
    }
  }
});
