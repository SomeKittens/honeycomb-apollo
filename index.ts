import { GraphQLRequestContext } from 'apollo-server-core/dist/requestPipelineAPI';
import beeline from 'honeycomb-beeline';
import {
  ResponsePath,
  GraphQLOutputType,
  GraphQLCompositeType,
} from 'graphql';
import { ApolloServerPlugin } from 'apollo-server-plugin-base';

import { responsePathAsString } from './responsePath';


// o: {
//   request: Request;
//   queryString ?: string;
//   parsedQuery ?: DocumentNode;
//   variables ?: Record<string, any>;
//   persistedQueryHit ?: boolean;
//   persistedQueryRegister ?: boolean;
//   context: TContext;
//   extensions ?: Record<string, any>;
//   requestContext: GraphQLRequestContext<TContext>;
// }

const generateResolverCtx = (path: ResponsePath, returnType: GraphQLOutputType, parentType: GraphQLCompositeType) => {
  const fieldResponsePath = responsePathAsString(path);
  const context = {
    name: fieldResponsePath,
    type: 'graphql_field_resolver',
    'graphql.type': returnType.toString(),
    'graphql.parent_type': parentType.toString(),
    'graphql.field_path': fieldResponsePath,
  };

  const id = path && path.key;
  if (path && path.prev && typeof path.prev.key === 'number') {
    context['graphql.field_name'] = `${path.prev.key}.${id}`;
  } else {
    context['graphql.field_name'] = id;
  }

  return context;
}

export const honeycombTracingPlugin = (_futureOptions = {}) => (): ApolloServerPlugin => ({
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
            console.log('executionDidEnd');
          },
          willResolveField: ({ info }) => {
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
              console.log('creating span');
              let res;
              new Promise(resolve => {
                res = resolve;
              })
                .then((err?: Error) => {
                  console.log('done, finishing span');
                  if (err) {
                    beeline.customContext.add({ error: err.message });
                  }
                  beeline.finishSpan(span);
                });

              return res;
            });
          }
        };
      },
      willSendResponse: () => {
        console.log('willSendResponse');
        // Now we're done
        // TODO: Verify all spans have closed
        beeline.finishSpan(rootSpan);
      }
    }
  }
});






// export class HoneycombTracingExtension<TContext = any> implements GraphQLExtension<TContext> {
//   public APOLLO_TRACING_EXTENSION_VERSION = 1;

//   public queryString: string;

//   public documentAST: DocumentNode;

//   public operationName: string;

//   public rootSpan;

//   public constructor() {
//     beeline.customContext.add({ APOLLO_TRACING_EXTENSION_VERSION: this.APOLLO_TRACING_EXTENSION_VERSION });
//   }

//   public requestDidStart(o: {
//     request: Request;
//     queryString?: string;
//     parsedQuery?: DocumentNode;
//     variables?: Record<string, any>;
//     persistedQueryHit?: boolean;
//     persistedQueryRegister?: boolean;
//     context: TContext;
//     extensions?: Record<string, any>;
//     requestContext: GraphQLRequestContext<TContext>;
//   }): EndHandler {
//     // Generally, we'll get queryString here and not parsedQuery; we only get
//     // parsedQuery if you're using an OperationStore. In normal cases we'll get
//     // our documentAST in the execution callback after it is parsed.
//     this.queryString = o.queryString;
//     this.documentAST = o.parsedQuery;

//     this.rootSpan = beeline.startSpan({ name: 'graphql_query' });
//     this.rootSpan.addContext({ 'graphql.query_string': this.queryString });

//     return () => {
//       beeline.finishSpan(this.rootSpan);
//     };
//   }

//   public executionDidStart(o: { executionArgs: ExecutionArgs }) {
//     // If the operationName is explicitly provided, save it. If there's just one
//     // named operation, the client doesn't have to provide it, but we still want
//     // to know the operation name so that the server can identify the query by
//     // it without having to parse a signature.
//     //
//     // Fortunately, in the non-error case, we can just pull this out of
//     // the first call to willResolveField's `info` argument.  In an
//     // error case (eg, the operationName isn't found, or there are more
//     // than one operation and no specified operationName) it's OK to continue
//     // to file this trace under the empty operationName.
//     if (o.executionArgs.operationName) {
//       this.operationName = o.executionArgs.operationName;
//       this.rootSpan.addContext({ 'graphql.operation_name': this.operationName });
//     }
//     this.documentAST = o.executionArgs.document;
//   }

//   public willResolveField(
//     _source: any,
//     _args: { [argName: string]: any },
//     _context: TContext,
//     info: GraphQLResolveInfo,
//   ): ((error: Error | null, result: any) => void) | void {
//     if (this.operationName === undefined) {
//       this.operationName = (info.operation.name && info.operation.name.value) || '';
//       this.rootSpan.addContext({ 'graphql.operation_name': this.operationName });
//     }


    
//   }

//   private newSpan(path: ResponsePath, returnType: GraphQLOutputType, parentType: GraphQLCompositeType) {
//     const fieldResponsePath = responsePathAsString(path);
//     const context = {
//       name: 'graphql_field_resolver',
//       'graphql.type': returnType.toString(),
//       'graphql.parent_type': parentType.toString(),
//       'graphql.field_path': fieldResponsePath,
//     };

//     const id = path && path.key;
//     if (path && path.prev && typeof path.prev.key === 'number') {
//       context['graphql.field_name'] = `${path.prev.key}.${id}`;
//     } else {
//       context['graphql.field_name'] = id;
//     }

//     return context;
//   }
// }
