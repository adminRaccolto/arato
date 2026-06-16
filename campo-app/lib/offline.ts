import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';

type QueueItem = {
  id: string;
  table: string;
  payload: Record<string, unknown>;
  timestamp: number;
};

const QUEUE_KEY = 'arato_offline_queue';

async function getQueue(): Promise<QueueItem[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function setQueue(items: QueueItem[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export async function enqueue(table: string, payload: Record<string, unknown>) {
  const queue = await getQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    table,
    payload,
    timestamp: Date.now(),
  });
  await setQueue(queue);
}

export async function queueCount(): Promise<number> {
  return (await getQueue()).length;
}

export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  const queue = await getQueue();
  if (!queue.length) return { synced: 0, failed: 0 };

  let synced = 0;
  const failed: QueueItem[] = [];

  for (const item of queue) {
    const { error } = await supabase.from(item.table).insert(item.payload);
    if (error) failed.push(item);
    else synced++;
  }

  await setQueue(failed);
  return { synced, failed: failed.length };
}

// Salva no banco ou, se offline, enfileira localmente
export async function saveOrQueue(
  table: string,
  payload: Record<string, unknown>,
): Promise<{ offline: boolean; error?: string }> {
  const net = await NetInfo.fetch();

  if (!net.isConnected) {
    await enqueue(table, payload);
    return { offline: true };
  }

  const { error } = await supabase.from(table).insert(payload);
  if (error) return { offline: false, error: error.message };
  return { offline: false };
}
