import 'reflect-metadata';
import AdminJS from 'adminjs';
import { Database, Resource } from '@adminjs/typeorm';

console.log('[ADMIN-SETUP] Registering @adminjs/typeorm adapter...');
console.log('[ADMIN-SETUP] Resource:', Resource);
console.log('[ADMIN-SETUP] Database:', Database);
AdminJS.registerAdapter({ Database, Resource });
