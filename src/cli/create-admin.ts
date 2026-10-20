/**
 * Create an admin from the command line (there is no HTTP registration endpoint).
 *
 *   npm run build && npm run admin:create -- --email ops@example.com --name "Ops Admin" [--role super_admin]
 *
 * The password is read from ADMIN_PASSWORD if set, otherwise prompted for
 * (hidden input). It is never accepted as a command-line argument because
 * arguments are visible in `ps` and shell history.
 */
import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as readline from 'readline';
import { AdminRole } from '../admins/admin-role';
import { AdminsModule } from '../admins/admins.module';
import { AdminsService } from '../admins/admins.service';
import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';

@Module({ imports: [AppConfigModule, DatabaseModule, AdminsModule] })
class CliModule {}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let prompted = false;
    out._writeToOutput = (s: string) => {
      if (!prompted) { out.output.write(s); prompted = true; } else if (s.includes('\n')) out.output.write('\n');
    };
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
  });
}

async function main() {
  const email = arg('email');
  const name = arg('name') ?? 'Administrator';
  const role = (arg('role') ?? AdminRole.ADMIN) as AdminRole;
  if (!email) throw new Error('Usage: admin:create -- --email <email> [--name "<name>"] [--role admin|super_admin]');
  if (!Object.values(AdminRole).includes(role)) throw new Error('--role must be admin or super_admin');

  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    password = await promptHidden('Password: ');
    const confirm = await promptHidden('Confirm password: ');
    if (password !== confirm) throw new Error('Passwords do not match.');
  }

  const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error'] });
  try {
    const admin = await app.get(AdminsService).create({ email, name, password, role });
    Logger.log(`Created ${admin.role} ${admin.email} (${admin.id})`, 'create-admin');
  } finally {
    await app.close();
  }
}

main().catch((err: Error) => {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
});
