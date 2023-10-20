import * as cdk from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

export class AwsStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'OnlineShopSingleTableAWS', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
    });

    table.addGlobalSecondaryIndex({
      indexName: 'gs1',
      partitionKey: { name: 'gs1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gs1sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ['gs1pk', 'gs1sk', 'data'],
    });

    // Cognito
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'OnlineShopAwsUserPool',
      signInAliases: {
        username: true,
        email: true,
      },
    });

    // Creating user pool client
    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
    });

    // Create the AppSync API
    const api = new appsync.GraphqlApi(this, 'OnlineShopAWS', {
      name: 'OnlineShopAWS',
      schema: appsync.SchemaFile.fromAsset('graphql/schema.graphql'),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool,
            appIdClientRegex: userPoolClient.userPoolClientId
          },
        },
      },
    });

    // Create resolvers for the mutations
    const mutationHandler = new lambda.Function(this, 'MutationHandler', {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'mutations.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        SINGLE_TABLE_NAME: table.tableName,
      },
    });

    // Create resolvers for the queries
    const queryHandler = new lambda.Function(this, 'QueryHandler', {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'queries.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        SINGLE_TABLE_NAME: table.tableName,
      },
    });

    // Create resolvers for the orders
    const orderHandler = new NodejsFunction(this, 'OrderHandler', {
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: 'lambda/order.js',
      environment: {
        SINGLE_TABLE_NAME: table.tableName,
      },
      bundling: {
        loader: {'.html': 'text'}
      }
    });

    // Grant the necessary SES permissions to the Lambda function's role
    const sesPolicy = new iam.Policy(this, 'SESPolicy', {
      statements: [
        new iam.PolicyStatement({
          actions: ['ses:SendEmail', 'ses:SendRawEmail'],
          resources: ['*'],  // This allows sending emails to/from any email address
          effect: iam.Effect.ALLOW,
        }),
      ],
    });

    // Attach the policy to the Lambda function's role
    orderHandler.role?.attachInlinePolicy(sesPolicy);

    // Add a data sources for the Lambda functions
    const lambdaDs = api.addLambdaDataSource('LambdaDataSource', mutationHandler);
    const lambdaQueryDs = api.addLambdaDataSource('QueriesDataSource', queryHandler);
    const lambdaOrderDs = api.addLambdaDataSource('OrderDataSource', orderHandler);

    // Create resolvers
    lambdaDs.createResolver("CreateProductResolver",{
      typeName: 'Mutation',
      fieldName: 'createProduct',
    });

    lambdaDs.createResolver("UpdateProductResolver",{
      typeName: 'Mutation',
      fieldName: 'updateProduct',
    });

    lambdaDs.createResolver("DeleteProductResolver",{
      typeName: 'Mutation',
      fieldName: 'deleteProduct',
    });

    lambdaDs.createResolver("CreateCategoryResolver", {
      typeName: 'Mutation',
      fieldName: 'createCategory',
    });

    lambdaDs.createResolver("CreateSupplierResolver", {
      typeName: 'Mutation',
      fieldName: 'createSupplier',
    });

    lambdaOrderDs.createResolver("PlaceOrderResolver", {
      typeName: 'Mutation',
      fieldName: 'placeOrder',
    });

    lambdaQueryDs.createResolver("getCategoriesResolver", {
      typeName: 'Query',
      fieldName: 'getCategories',
    });

    lambdaQueryDs.createResolver("getProductsResolver", {
      typeName: 'Query',
      fieldName: 'getProducts',
    });

    lambdaQueryDs.createResolver("getProductResolver", {
      typeName: 'Query',
      fieldName: 'getProduct',
    });

    // Connect the resolvers to the Lambda function
    api.grantMutation(mutationHandler);
    api.grantMutation(orderHandler);

    // Create a S3 Bucket
    const reportBucket = new s3.Bucket(this, 'ReportBucket', {
      versioned: true,
    });

    const reportGenerator = new NodejsFunction(this, 'ReportGenerator', {
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: 'lambda/report.js',
      environment: {
        SINGLE_TABLE_NAME: table.tableName,
      },
      bundling: {
        loader: {'.html': 'text'}
      }
    });

    // Grant the necessary permissions
    reportGenerator.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject', 's3:GetObject'],
      resources: [`${reportBucket.bucketArn}/*`],
    }));

    reportGenerator.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:Query'],
      resources: [table.tableArn],
    }));

    // Create a daily rule
    const dailyRule = new events.Rule(this, 'DailyRule', {
      schedule: events.Schedule.cron({ minute: '0', hour: '0' }),
    });

    dailyRule.addTarget(new targets.LambdaFunction(reportGenerator));

    table.grantReadWriteData(mutationHandler);
    table.grantReadWriteData(orderHandler);
    table.grantReadData(queryHandler);

    // Output the User Pool ID to the stack outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });

    cdk.Tags.of(table).add("Owner", "ahmad.sadeghi@trilogy.com");
    cdk.Tags.of(mutationHandler).add("Owner", "ahmad.sadeghi@trilogy.com");
    cdk.Tags.of(queryHandler).add("Owner", "ahmad.sadeghi@trilogy.com");
    cdk.Tags.of(orderHandler).add("Owner", "ahmad.sadeghi@trilogy.com");
    cdk.Tags.of(userPool).add("Owner", "ahmad.sadeghi@trilogy.com");
    cdk.Tags.of(reportBucket).add("Owner", "ahmad.sadeghi@trilogy.com");
    cdk.Tags.of(reportGenerator).add("Owner", "ahmad.sadeghi@trilogy.com");
  }
}
