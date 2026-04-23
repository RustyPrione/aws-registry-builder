const {
  CloudWatchLogsClient,
  GetLogEventsCommand,
} = require("@aws-sdk/client-cloudwatch-logs");

const { awsConfig } = require("../config/aws");

const client = new CloudWatchLogsClient(awsConfig);

const MAX_PAGES = 50;
const PAGE_LIMIT = 10000;

/**
 * Fetch all log events from the start of the stream (paginated).
 */
async function getBuildLogs(logGroupName, logStreamName) {
  if (!logGroupName || !logStreamName) {
    return [];
  }

  const messages = [];
  let nextToken;
  let pages = 0;

  while (pages < MAX_PAGES) {
    pages += 1;
    const command = new GetLogEventsCommand({
      logGroupName,
      logStreamName,
      startFromHead: true,
      nextToken,
      limit: PAGE_LIMIT,
    });

    const res = await client.send(command);
    for (const e of res.events || []) {
      if (e.message != null) messages.push(e.message);
    }

    const forward = res.nextForwardToken;
    if (!forward || forward === nextToken) {
      break;
    }
    nextToken = forward;
  }

  return messages;
}

module.exports = { getBuildLogs };
