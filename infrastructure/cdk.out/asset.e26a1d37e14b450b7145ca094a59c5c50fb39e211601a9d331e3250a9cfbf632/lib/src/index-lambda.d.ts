import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
export declare const handler: LambdaHandlerFn;
interface LambdaHandlerFn {
    (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2>;
}
export {};
