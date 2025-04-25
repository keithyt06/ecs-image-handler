# ECS Image Handler

A serverless solution for dynamic image processing using AWS ECS Fargate, CloudFront, and S3.

## Overview

ECS Image Handler is a serverless solution that provides on-the-fly image processing capabilities using AWS ECS Fargate. It allows you to resize, crop, rotate, and apply various transformations to images stored in Amazon S3 buckets.

### Key Features

- **Serverless Architecture**: Fully managed infrastructure using AWS ECS Fargate
- **Dynamic Image Processing**: Process images on-the-fly with various transformations
- **CDN Integration**: CloudFront distribution for caching and global content delivery
- **Scalable**: Automatically scales based on demand
- **Cost-Effective**: Pay only for what you use
- **Secure**: Proper IAM permissions and security groups

### Advantages over Lambda-based Solutions

- **No Size Limitations**: Process images of any size (Lambda has a 6MB response size limit)
- **Longer Processing Time**: No 15-minute execution time limit
- **More Processing Power**: Access to more CPU and memory resources
- **Consistent Performance**: No cold start issues

## Deployment

See the [Deployment Guide](./DEPLOYMENT.md) for detailed instructions on how to deploy and use the ECS Image Handler.

## Architecture

The solution consists of the following components:

1. **CloudFront**: Provides caching and global content delivery
2. **Application Load Balancer**: Routes requests to ECS Fargate tasks
3. **ECS Fargate**: Runs the image processing service
4. **S3**: Stores the original images
5. **DynamoDB**: Stores image processing styles (optional)

### Workflow

1. An image request is sent through CloudFront
2. If the request is not cached, CloudFront forwards it to the Application Load Balancer
3. The ALB routes the request to an ECS Fargate task
4. The ECS task retrieves the image from S3, processes it according to the request parameters, and returns it
5. CloudFront caches the processed image for future requests
6. If the request doesn't require any modification, CloudFront will directly access the image from S3

## Prerequisites

- [AWS Account](https://aws.amazon.com/)
- [AWS CLI](https://aws.amazon.com/cli/) configured with appropriate permissions
- [Node.js](https://nodejs.org/) (version 14.x or later)
- [AWS CDK](https://aws.amazon.com/cdk/) (version 2.x)
- [Docker](https://www.docker.com/) (for local development and testing)

## License

This project is licensed under the Apache-2.0 License.
