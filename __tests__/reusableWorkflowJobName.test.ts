import nock from 'nock';

process.env.GITHUB_RUN_ID = '2';

import {
  gitHubToken,
  gitHubBaseUrl,
  newWith,
  setupNockCommit,
  setupNockJobs,
  successMsg,
  webhookUrl,
} from './helper';
import { Client, With, Success } from '../src/client';

beforeAll(() => {
  nock.disableNetConnect();
  setupNockCommit(process.env.GITHUB_SHA as string);
  setupNockJobs(
    process.env.GITHUB_RUN_ID as string,
    'actions.reusable-workflow-job-name.jobs',
  );
});
afterAll(() => {
  nock.cleanAll();
  nock.enableNetConnect();
});

describe('job_name', () => {
  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = '8398a7/action-slack';
    process.env.GITHUB_EVENT_NAME = 'push';
    const github = require('@actions/github');
    github.context.payload = {};
  });

  it('works even if the job is in reusable workflow', async () => {
    const withParams: With = {
      ...newWith(),
      status: Success,
      fields: 'job,took',
    };
    const client = new Client(
      withParams,
      gitHubToken,
      gitHubBaseUrl,
      webhookUrl,
    );
    expect(await client.prepare('')).toStrictEqual({
      text: successMsg,
      attachments: [
        {
          author_name: '',
          color: 'good',
          fields: [
            {
              short: true,
              title: 'job',
              value:
                '<https://github.com/8398a7/action-slack/runs/762195612|notification>',
            },
            { short: true, title: 'took', value: '1 hour 1 min 1 sec' },
          ],
        },
      ],
      username: '',
      icon_emoji: '',
      icon_url: '',
      channel: '',
    });
  });
});
