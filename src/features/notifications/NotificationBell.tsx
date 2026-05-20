import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Notification = {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
};

function NotificationBell({ userId }: { userId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    loadNotifications();
  }, [userId]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications],
  );

  async function loadNotifications() {
    setIsLoading(true);

    const { data, error } = await supabase
      .from('notifications')
      .select('id, title, message, type, is_read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    setIsLoading(false);

    if (error) {
      console.error('Load notifications Supabase error:', error);
      return;
    }

    setNotifications((data ?? []) as Notification[]);
  }

  async function markAllRead() {
    const unreadIds = notifications
      .filter((notification) => !notification.is_read)
      .map((notification) => notification.id);

    if (unreadIds.length === 0) {
      return;
    }

    setNotifications((current) =>
      current.map((notification) => ({ ...notification, is_read: true })),
    );

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds);

    if (error) {
      console.error('Mark notifications read Supabase error:', error);
      await loadNotifications();
    }
  }

  async function markOneRead(notificationId: string) {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId
          ? { ...notification, is_read: true }
          : notification,
      ),
    );

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) {
      console.error('Mark notification read Supabase error:', error);
      await loadNotifications();
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        className="relative inline-flex size-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/15"
        type="button"
        aria-label="Notifications"
        onClick={() => {
          setIsOpen((current) => !current);
          if (!isOpen) {
            loadNotifications();
          }
        }}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[0.65rem] font-black leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 z-30 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line-200 bg-white text-ink-900 shadow-xl">
          <div className="flex items-center justify-between border-b border-line-200 px-4 py-3">
            <div>
              <p className="text-sm font-black">Notifications</p>
              <p className="text-xs font-semibold text-ink-700">
                {unreadCount} unread
              </p>
            </div>
            <button
              className="rounded-full border border-line-200 px-3 py-1.5 text-xs font-bold text-court-900 transition hover:border-court-500 hover:bg-court-50"
              type="button"
              onClick={markAllRead}
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-[24rem] overflow-y-auto">
            {isLoading ? (
              <p className="px-4 py-6 text-center text-sm font-semibold text-ink-700">
                Loading notifications...
              </p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm font-semibold text-ink-700">
                No notifications yet.
              </p>
            ) : (
              notifications.map((notification) => (
                <button
                  className={`block w-full border-b border-line-200 px-4 py-3 text-left transition last:border-b-0 ${
                    notification.is_read ? 'bg-white' : 'bg-blue-50'
                  } hover:bg-court-50`}
                  key={notification.id}
                  type="button"
                  onClick={() => markOneRead(notification.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-ink-900">
                        {notification.title}
                      </p>
                      <p className="mt-1 text-sm leading-5 text-ink-700">
                        {notification.message}
                      </p>
                      <p className="mt-2 text-xs font-semibold text-ink-500">
                        {formatNotificationDate(notification.created_at)}
                      </p>
                    </div>
                    {!notification.is_read && (
                      <span className="mt-1 size-2 shrink-0 rounded-full bg-red-500" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M18 9a6 6 0 0 0-12 0c0 7-2 7-2 9h16c0-2-2-2-2-9Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path d="M10 21h4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default NotificationBell;
