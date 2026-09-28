import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CampaignEmbed from './CampaignEmbed';

const mockCampaign = {
  id: 'c-100',
  title: 'Clean Water Initiative',
  description: 'Providing clean water filters to rural communities',
  target_amount: 10000,
  raised_amount: 5000,
  asset_type: 'USDC',
  backer_count: 25,
  progress_percentage: null, // Test null/undefined resilience
  contribution_url: 'https://example.com/campaigns/c-100',
};

describe('CampaignEmbed', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockCampaign),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders safe progress percentage and never displays NaN%', async () => {
    render(
      <MemoryRouter initialEntries={['/embed/campaigns/c-100']}>
        <Routes>
          <Route path="/embed/campaigns/:id" element={<CampaignEmbed />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Clean Water Initiative')).toBeInTheDocument();
    });

    // 5000 / 10000 = 50.0%
    expect(screen.getByText('50.0%')).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it('SSE stays connected across contributions without reconnecting', async () => {
    const instances = [];
    class MockEventSource {
      constructor(url) {
        this.url = url;
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.close = vi.fn();
        instances.push(this);
      }
    }
    vi.stubGlobal('EventSource', MockEventSource);

    render(
      <MemoryRouter initialEntries={['/embed/campaigns/c-100']}>
        <Routes>
          <Route path="/embed/campaigns/:id" element={<CampaignEmbed />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(instances.length).toBe(1);
    });

    // Simulate incoming SSE contribution message
    act(() => {
      instances[0].onmessage({
        data: JSON.stringify({
          type: 'contribution',
          raised_amount: 7500,
          contribution: { tx_hash: 'tx-1' },
        }),
      });
    });

    // Verify progress updated to 75.0%
    await waitFor(() => {
      expect(screen.getByText('75.0%')).toBeInTheDocument();
    });

    // Verify SSE was NOT closed or recreated
    expect(instances[0].close).not.toHaveBeenCalled();
    expect(instances.length).toBe(1);
  });

  it('auto-reconnects on SSE error', async () => {
    const instances = [];
    class MockEventSource {
      constructor(url) {
        this.url = url;
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.close = vi.fn();
        instances.push(this);
      }
    }
    vi.stubGlobal('EventSource', MockEventSource);

    render(
      <MemoryRouter initialEntries={['/embed/campaigns/c-100']}>
        <Routes>
          <Route path="/embed/campaigns/:id" element={<CampaignEmbed />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(instances.length).toBe(1);
    });

    act(() => {
      instances[0].onerror(new Event('error'));
    });

    expect(instances[0].close).toHaveBeenCalled();
  });
});
