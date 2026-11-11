#!/usr/bin/env ts-node
// scripts/seed-e11.ts — Entry point for E11 Seeding Script
// Forwards to server/src/scripts/seed-e11.ts
import path from 'path';

require(path.join(__dirname, '../server/src/scripts/seed-e11.ts'));
