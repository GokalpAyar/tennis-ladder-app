import { supabase } from './supabase';

export type NotificationType =
  | 'challenge'
  | 'match'
  | 'schedule'
  | 'result'
  | 'admin'
  | 'info';

export async function createNotification({
  userId,
  title,
  message,
  type = 'info',
}: {
  userId: string;
  title: string;
  message: string;
  type?: NotificationType;
}) {
  const { error } = await supabase.rpc('create_notification', {
    target_user_id: userId,
    notification_title: title,
    notification_message: message,
    notification_type: type,
  });

  if (error) {
    console.error('Create notification Supabase error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
  }
}
