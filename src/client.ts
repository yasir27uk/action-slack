import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';
import { IncomingWebhook, IncomingWebhookSendArguments } from '@slack/webhook';

export const Success = 'success';
type SuccessType = 'success';
export const Failure = 'failure';
type FailureType = 'failure';
export const Cancelled = 'cancelled';
type CancelledType = 'cancelled';
export const Custom = 'custom';
export const Always = 'always';
type AlwaysType = 'always';

export interface With {
  status: string;
  mention: string;
  author_name: string;
  if_mention: string;
  username: string;
  icon_emoji: string;
  icon_url: string;
  channel: string;
  fields: string;
}

export interface Field {
  title: string;
  value: string;
  short: boolean;
}

const groupMention = ['here', 'channel'];
const subteamMention = 'subteam^';

export class Client {
  private webhook: IncomingWebhook;
  private github?: InstanceType<typeof GitHub>;
  private with: With;

  constructor(props: With, token?: string, webhookUrl?: string) {
    this.with = props;
    if (this.with.fields === '') this.with.fields = 'repo,commit';

    if (token !== undefined) {
      this.github = getOctokit(token);
    }

    if (webhookUrl === undefined) {
      throw new Error('Specify secrets.SLACK_WEBHOOK_URL');
    }
    this.webhook = new IncomingWebhook(webhookUrl);
  }

  async success(text: string) {
    const template = await this.payloadTemplate();
    template.attachments[0].color = 'good';
    template.text += this.mentionText(this.with.mention, Success);
    template.text += this.insertText(
      ':white_check_mark: Succeeded GitHub Actions\n',
      text,
    );

    return template;
  }

  async fail(text: string) {
    const template = await this.payloadTemplate();
    template.attachments[0].color = 'danger';
    template.text += this.mentionText(this.with.mention, Failure);
    template.text += this.insertText(
      ':no_entry: Failed GitHub Actions\n',
      text,
    );

    return template;
  }

  async cancel(text: string) {
    const template = await this.payloadTemplate();
    template.attachments[0].color = 'warning';
    template.text += this.mentionText(this.with.mention, Cancelled);
    template.text += this.insertText(
      ':warning: Canceled GitHub Actions\n',
      text,
    );

    return template;
  }

  async send(payload: string | IncomingWebhookSendArguments) {
    core.debug(JSON.stringify(context, null, 2));
    await this.webhook.send(payload);
    core.debug('send message');
  }

  includesField(field: string) {
    const { fields } = this.with;
    const normalized = fields.replace(/ /g, '').split(',');
    return normalized.includes(field);
  }

  filterField<T extends Array<Field | undefined>, U extends undefined>(
    array: T,
    diff: U,
  ) {
    return array.filter(item => item !== diff) as Exclude<
      T extends { [K in keyof T]: infer U } ? U : never,
      U
    >[];
  }

  private async payloadTemplate() {
    const text = '';
    const { username, icon_emoji, icon_url, channel } = this.with;

    return {
      text,
      username,
      icon_emoji,
      icon_url,
      channel,
      attachments: [
        {
          color: '',
          author_name: this.with.author_name,
          fields: await this.fields(),
        },
      ],
    };
  }

  private async fields(): Promise<Field[]> {
    const { sha } = context;
    const { owner, repo } = context.repo;

    const commit = await this.github?.repos.getCommit({
      owner,
      repo,
      ref: sha,
    });
    const author = commit?.data.commit.author;

    return this.filterField(
      [
        this.repo,
        commit && this.includesField('message')
          ? {
              title: 'message',
              value: `<${commit.data.html_url}|${
                commit.data.commit.message.split('\n')[0]
              }>`,
              short: true,
            }
          : undefined,
        this.commit,
        author && this.includesField('author')
          ? {
              title: 'author',
              value: `${author.name}<${author.email}>`,
              short: true,
            }
          : undefined,
        await this.job(),
        await this.took(),
        this.eventName,
        this.ref,
        this.workflow,
      ],
      undefined,
    );
  }

  private async took(): Promise<Field | undefined> {
    if (!this.includesField('took')) return undefined;

    const { owner, repo } = context.repo;
    const runId = process.env.GITHUB_RUN_ID as string;
    const resp = await this.github?.actions.listJobsForWorkflowRun({
      owner,
      repo,
      run_id: parseInt(runId, 10),
    });
    const currentJob = resp?.data.jobs.find(
      job => job.name === process.env.GITHUB_JOB,
    );
    let time =
      new Date().getTime() - new Date(currentJob?.started_at ?? '').getTime();
    const h = Math.floor(time / (1000 * 60 * 60));
    time -= h * 1000 * 60 * 60;
    const m = Math.floor(time / (1000 * 60));
    time -= m * 1000 * 60;
    const s = Math.floor(time / 1000);

    let value = '';
    if (h > 0) {
      value += `${h} hour `;
    }
    if (m > 0) {
      value += `${m} min `;
    }
    if (s > 0) {
      value += `${s} sec`;
    }

    return {
      value,
      title: 'took',
      short: true,
    };
  }

  private async job(): Promise<Field | undefined> {
    if (!this.includesField('job')) return undefined;

    const { owner, repo } = context.repo;
    const runId = process.env.GITHUB_RUN_ID as string;
    const resp = await this.github?.actions.listJobsForWorkflowRun({
      owner,
      repo,
      run_id: parseInt(runId, 10),
    });
    const jobId = resp?.data.jobs.find(
      job => job.name === process.env.GITHUB_JOB,
    )?.id;

    return {
      title: 'job',
      value: `<https://github.com/${owner}/${repo}/runs/${jobId}|${process.env.GITHUB_JOB}>`,
      short: true,
    };
  }

  private get commit(): Field | undefined {
    if (!this.includesField('commit')) return undefined;

    const { sha } = context;
    const { owner, repo } = context.repo;

    return {
      title: 'commit',
      value: `<https://github.com/${owner}/${repo}/commit/${sha}|${sha.slice(
        0,
        8,
      )}>`,
      short: true,
    };
  }

  private get repo(): Field | undefined {
    if (!this.includesField('repo')) return undefined;

    const { owner, repo } = context.repo;

    return {
      title: 'repo',
      value: `<https://github.com/${owner}/${repo}|${owner}/${repo}>`,
      short: true,
    };
  }

  private get eventName(): Field | undefined {
    if (!this.includesField('eventName')) return undefined;

    return {
      title: 'eventName',
      value: context.eventName,
      short: true,
    };
  }

  private get ref(): Field | undefined {
    if (!this.includesField('ref')) return undefined;

    return { title: 'ref', value: context.ref, short: true };
  }

  private get workflow(): Field | undefined {
    if (!this.includesField('workflow')) return undefined;

    const sha = context.payload.pull_request?.head.sha ?? context.sha;
    const { owner, repo } = context.repo;

    return {
      title: 'workflow',
      value: `<https://github.com/${owner}/${repo}/commit/${sha}/checks|${context.workflow}>`,
      short: true,
    };
  }

  private getIdString(id: string): string {
    if (id.includes(subteamMention)) return `<!${id}>`;
    else return `<@${id}>`;
  }

  private mentionText(
    mention: string,
    status: SuccessType | FailureType | CancelledType | AlwaysType,
  ) {
    if (
      !this.with.if_mention.includes(status) &&
      this.with.if_mention !== Always
    ) {
      return '';
    }

    const normalized = mention.replace(/ /g, '');
    if (groupMention.includes(normalized)) {
      return `<!${normalized}> `;
    } else if (normalized !== '') {
      const text = normalized
        .split(',')
        .map(id => this.getIdString(id))
        .join(' ');
      return `${text} `;
    }
    return '';
  }

  private insertText(defaultText: string, text: string) {
    return text === '' ? defaultText : text;
  }
}
