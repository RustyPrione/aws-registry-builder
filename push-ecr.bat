tar -a -c -f ../app-v1.zip * --exclude=node_modules

aws s3 cp app-v1.zip s3://infra-image-pusher/app-v1.zip

aws codebuild start-build --project-name phtn-ai-registry-builder --source-type-override S3 --source-location-override infra-image-pusher/app-v2.zip --buildspec-override "buildspec.yml" --environment-variables-override name=IMAGE_URI,value=831047846688.dkr.ecr.us-east-2.amazonaws.com/infra/image-pusher:v2,type=PLAINTEXT