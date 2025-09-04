declare module '@aws-sdk/client-ecs' {
  export class ECSClient {
    constructor(config: any);
    send(command: any): Promise<any>;
  }
  export class DescribeServicesCommand {
    constructor(input: any);
  }
  export class UpdateServiceCommand {
    constructor(input: any);
  }
  export class ListTasksCommand {
    constructor(input: any);
  }
  export class DescribeTasksCommand {
    constructor(input: any);
  }
  export function waitUntilServicesStable(...args: any[]): Promise<any>;
  export interface KeyValuePair {
    name?: string;
    value?: string;
  }
}
declare module '@aws-sdk/client-ec2' {
  export class EC2Client {
    constructor(config: any);
    send(command: any): Promise<any>;
  }
  export class DescribeNetworkInterfacesCommand {
    constructor(input: any);
  }
}
