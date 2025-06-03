export interface EnvironmentConfig {
  auth: {
    userPoolDomain: string;
    callbackUrls: string[];
    logoutUrls: string[];
  };
  api: {
    throttleLimit: number;
    burstLimit: number;
    monthlyRequestQuota: number;
  };
  compute: {
    defaultMemorySize: number;
    defaultTimeout: number;
    maxConcurrentExecutions: number;
    fargateSpotEnabled: boolean;
  };
  ai: {
    defaultModel: string;
    maxTokensPerRequest: number;
    enabledModels: string[];
  };
  billing: {
    stripePriceId: string;
    freeTierRequests: number;
    costPerThousandRequests: number;
  };
  monitoring: {
    logRetentionDays: number;
    alarmEmail?: string;
  };
  domain?: {
    domainName: string;
    certificateArn?: string;
  };
}

export class Config implements EnvironmentConfig {
  auth: EnvironmentConfig['auth'];
  api: EnvironmentConfig['api'];
  compute: EnvironmentConfig['compute'];
  ai: EnvironmentConfig['ai'];
  billing: EnvironmentConfig['billing'];
  monitoring: EnvironmentConfig['monitoring'];
  domain?: EnvironmentConfig['domain'];

  constructor(private environment: string) {
    const configs: Record<string, EnvironmentConfig> = {
      dev: {
        auth: {
          userPoolDomain: 'ai-office-dev',
          callbackUrls: ['http://localhost:3000/auth/callback'],
          logoutUrls: ['http://localhost:3000'],
        },
        api: {
          throttleLimit: 100,
          burstLimit: 200,
          monthlyRequestQuota: 100000,
        },
        compute: {
          defaultMemorySize: 1024,
          defaultTimeout: 300,
          maxConcurrentExecutions: 10,
          fargateSpotEnabled: true,
        },
        ai: {
          defaultModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
          maxTokensPerRequest: 4096,
          enabledModels: [
            'anthropic.claude-3-sonnet-20240229-v1:0',
            'anthropic.claude-3-haiku-20240307-v1:0',
          ],
        },
        billing: {
          stripePriceId: 'price_dev_monthly',
          freeTierRequests: 1000,
          costPerThousandRequests: 0.50,
        },
        monitoring: {
          logRetentionDays: 7,
        },
      },
      prod: {
        auth: {
          userPoolDomain: 'ai-office',
          callbackUrls: ['https://app.ai-office.dev/auth/callback'],
          logoutUrls: ['https://app.ai-office.dev'],
        },
        api: {
          throttleLimit: 1000,
          burstLimit: 2000,
          monthlyRequestQuota: 1000000,
        },
        compute: {
          defaultMemorySize: 2048,
          defaultTimeout: 600,
          maxConcurrentExecutions: 100,
          fargateSpotEnabled: true,
        },
        ai: {
          defaultModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
          maxTokensPerRequest: 8192,
          enabledModels: [
            'anthropic.claude-3-opus-20240229-v1:0',
            'anthropic.claude-3-sonnet-20240229-v1:0',
            'anthropic.claude-3-haiku-20240307-v1:0',
          ],
        },
        billing: {
          stripePriceId: 'price_prod_monthly',
          freeTierRequests: 100,
          costPerThousandRequests: 1.00,
        },
        monitoring: {
          logRetentionDays: 30,
          alarmEmail: 'ops@ai-office.dev',
        },
        domain: {
          domainName: 'ai-office.dev',
          // certificateArn will be set after creation
        },
      },
    };

    const config = configs[environment] || configs.dev;
    Object.assign(this, config);
  }

  get prefix(): string {
    return `ai-office-${this.environment}`;
  }

  get isProd(): boolean {
    return this.environment === 'prod';
  }
}