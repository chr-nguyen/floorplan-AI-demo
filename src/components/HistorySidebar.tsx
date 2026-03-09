import React from 'react';

interface HistorySidebarProps {
  historyItems: any[];
  loadingHistory: boolean;
  onLoadItem: (item: any) => void;
  onRefresh: () => void;
}

export default function HistorySidebar({ historyItems, loadingHistory, onLoadItem, onRefresh }: HistorySidebarProps) {
  return (
    <div className="history-sidebar">
      <div className="history-title">Recent 3D Designs</div>
      <div className="history-list">
        {loadingHistory && historyItems.length === 0 ? (
          <div className="history-empty">Loading...</div>
        ) : historyItems.length > 0 ? (
          historyItems.map((item) => (
            <div
              key={item.id}
              className="history-item-container"
              onClick={() => onLoadItem(item)}
            >
              <div
                className="history-item"
                title={`Created: ${new Date(item.created_at).toLocaleString()}`}
              >
                {item.thumbnail_url || item.image_url || item.texture_urls?.base_color ? (
                  <img
                    src={item.thumbnail_url || item.image_url || item.texture_urls.base_color}
                    alt="Thumbnail"
                  />
                ) : (
                  <div style={{ fontSize: '0.7rem', color: '#aaa' }}>3D</div>
                )}
                <div className={`status-indicator ${item.status === 'SUCCEEDED' ? 'complete' : ''}`} />
              </div>
              <div className="history-item-date">
                {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                <br />
                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))
        ) : (
          <div className="history-empty">No history found.</div>
        )}
      </div>
      <button
        onClick={onRefresh}
        disabled={loadingHistory}
        style={{
          marginTop: '1rem',
          fontSize: '0.75rem',
          background: 'none',
          border: 'none',
          color: '#0070f3',
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        Refresh History
      </button>
    </div>
  );
}
