import { SNSHandler } from 'aws-lambda';

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

interface SlackMessage {
  text: string;
  attachments?: Array<{
    color: string;
    title?: string;
    text?: string;
    fields?: Array<{
      title: string;
      value: string;
      short?: boolean;
    }>;
    footer?: string;
    ts?: number;
  }>;
}

export const handler: SNSHandler = async (event) => {
  if (!SLACK_WEBHOOK_URL) {
    console.log('Slack webhook URL not configured, skipping notification');
    return;
  }

  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.Sns.Message);
      const subject = record.Sns.Subject || 'AI Office Alert';
      
      const slackMessage: SlackMessage = {
        text: `⚠️ ${subject}`,
        attachments: [{
          color: getColorForAlarm(message),
          title: subject,
          text: formatAlarmMessage(message),
          fields: getFieldsFromMessage(message),
          footer: 'AI Office Monitoring',
          ts: Math.floor(Date.now() / 1000),
        }],
      };

      const response = await fetch(SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(slackMessage),
      });

      if (!response.ok) {
        throw new Error(`Slack API returned ${response.status}: ${await response.text()}`);
      }

      console.log('Successfully sent notification to Slack');
    } catch (error) {
      console.error('Failed to send Slack notification:', error);
      throw error;
    }
  }
};

function getColorForAlarm(message: any): string {
  if (message.NewStateValue === 'ALARM') return 'danger';
  if (message.NewStateValue === 'OK') return 'good';
  return 'warning';
}

function formatAlarmMessage(message: any): string {
  if (message.AlarmDescription) {
    return message.AlarmDescription;
  }
  
  if (message.NewStateReason) {
    return message.NewStateReason;
  }
  
  return JSON.stringify(message, null, 2);
}

function getFieldsFromMessage(message: any): Array<{ title: string; value: string; short?: boolean }> {
  const fields = [];
  
  if (message.AlarmName) {
    fields.push({
      title: 'Alarm',
      value: message.AlarmName,
      short: true,
    });
  }
  
  if (message.NewStateValue) {
    fields.push({
      title: 'State',
      value: message.NewStateValue,
      short: true,
    });
  }
  
  if (message.Region) {
    fields.push({
      title: 'Region',
      value: message.Region,
      short: true,
    });
  }
  
  if (message.Trigger?.MetricName) {
    fields.push({
      title: 'Metric',
      value: message.Trigger.MetricName,
      short: true,
    });
  }
  
  return fields;
}