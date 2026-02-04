import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";

type HostEntry = {
  name: string;
  hostname?: string;
};

function parseSshConfig(configText: string): HostEntry[] {
  const hosts: Record<string, HostEntry> = {};
  const lines = configText.split(/\r?\n/);
  let currentHosts: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const hostMatch = /^Host\s+(.+)$/i.exec(line);
    if (hostMatch) {
      const names = hostMatch[1]
        .split(/\s+/)
        .map((name) => name.trim())
        .filter(Boolean)
        .filter((name) => !/[?*]/.test(name) && name !== "*");
      currentHosts = names;
      for (const name of names) {
        if (!hosts[name]) hosts[name] = { name };
      }
      continue;
    }

    const hostnameMatch = /^HostName\s+(.+)$/i.exec(line);
    if (hostnameMatch && currentHosts.length > 0) {
      for (const name of currentHosts) {
        if (!hosts[name]) hosts[name] = { name };
        if (!hosts[name].hostname)
          hosts[name].hostname = hostnameMatch[1].trim();
      }
    }
  }

  return Object.values(hosts).sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET() {
  try {
    const configPath = path.join(os.homedir(), ".ssh", "config");
    if (!fs.existsSync(configPath)) {
      return NextResponse.json({ hosts: [] });
    }
    const configText = fs.readFileSync(configPath, "utf-8");
    const hosts = parseSshConfig(configText);
    return NextResponse.json({ hosts });
  } catch (error) {
    console.error("[ssh-hosts] failed to read config", error);
    return NextResponse.json({ hosts: [] }, { status: 200 });
  }
}

export const runtime = "nodejs";
