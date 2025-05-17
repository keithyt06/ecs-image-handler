#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ECSImageHandlerStack } from './ecs-image-handler-stack';

const app = new cdk.App();
const region = app.node.tryGetContext('region') || 'us-east-1';

new ECSImageHandlerStack(app, 'ecs-image-handler-stack', {
  env: {
    account: process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT,
    region: region
  },
  description: 'ECS Image Handler Stack - Serverless image processing with ECS Fargate'
});

app.synth();
