import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';

const api = {
  getAdminCampaigns: vi.fn(),
  getCampaignDisputes: vi.fn(),
  updateDispute: vi.fn(),
  adminFeatureCampaign: vi.fn(),
  adminUnfeatureCampaign: vi.fn(),
};

const dialogApi = {
  confirm: vi.fn(),
  prompt: vi.fn(),
  alert: vi.fn(),
};

const authState = { user: { id: '1', name: 'Admin', email: 'admin@example.com', role: 'admin' } };
const mockNavigate = vi.fn();

vi.mock('../services/api', () => ({ api }));
vi.mock('../context/DialogContext', () => ({ useDialog: () => dialogApi }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const CAMPAIGNS = [
  { id: 1, title: 'Alpha' },
  { id: 2, title: 'Beta' },
];
const DISPUTES = [
  { id: 'd1', campaign_title: 'Alpha', status: 'open', reason: 'Funds not delivered', created_at: '2024-06-01T00:00:00Z' },
  { id: 'd2', campaign_title: 'Beta', status: 'under_review', reason: 'Late milestone', created_at: '2024-06-02T00:00:00Z' },
];

function mockInitialData() {
  api.getAdminCampaigns.mockResolvedValue(CAMPAIGNS);
  api.getCampaignDisputes.mockImplementation((id) =>
    Promise.resolve(id === 1 ? [DISPUTES[0]] : [DISPUTES[1]])
  );
}

describe('AdminDashboard', () => {
  beforeEach(() => {
    api.getAdminCampaigns.mockReset();
    api.getCampaignDisputes.mockReset();
    api.updateDispute.mockReset();
    api.adminFeatureCampaign.mockReset();
    api.adminUnfeatureCampaign.mockReset();
    dialogApi.confirm.mockReset().mockResolvedValue(true);
    dialogApi.prompt.mockReset().mockResolvedValue('');
    dialogApi.alert.mockReset().mockResolvedValue(undefined);
    authState.user = { id: '1', name: 'Admin', email: 'admin@example.com', role: 'admin' };
    mockNavigate.mockReset();
  });

  it('redirects non-admin users away', () => {
    authState.user = { id: '2', name: 'U', role: 'contributor' };
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('lists admin campaigns', async () => {
    mockInitialData();
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('shows an empty state when there are no disputes', async () => {
    api.getAdminCampaigns.mockResolvedValue([]);
    api.getCampaignDisputes.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );
    expect(await screen.findByText('No disputes on record.')).toBeInTheDocument();
  });

  it('lists disputes sorted newest first with their campaign titles', async () => {
    mockInitialData();
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );
    expect(await screen.findByText('Funds not delivered')).toBeInTheDocument();
    const cards = screen.getAllByText(/#d[12]/i);
    expect(cards.length).toBe(2);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('resolves a dispute with a note via the update endpoint', async () => {
    mockInitialData();
    api.updateDispute.mockResolvedValue({ id: 'd2', status: 'resolved_creator', resolution_note: 'Handled' });
    dialogApi.prompt.mockResolvedValue('Handled');
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );
    expect(await screen.findByText('Late milestone'));

    const card = screen.getByText('Late milestone').closest('div[style]');
    const resolveButton = within(card).getByRole('button', { name: /resolved_creator/i });
    await user.click(resolveButton);

    await waitFor(() => {
      expect(dialogApi.prompt).toHaveBeenCalled();
      expect(api.updateDispute).toHaveBeenCalledWith(
        'd2',
        expect.objectContaining({ status: 'resolved_creator' })
      );
    });
  });

  it('does not update the dispute when the prompt is cancelled', async () => {
    mockInitialData();
    dialogApi.prompt.mockResolvedValue(null);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );
    expect(await screen.findByText('Funds not delivered'));

    const card = screen.getByText('Funds not delivered').closest('div[style]');
    await user.click(within(card).getByRole('button', { name: /resolved_contributor/i }));

    expect(api.updateDispute).not.toHaveBeenCalled();
  });

  it('shows an alert when dispute resolution fails', async () => {
    mockInitialData();
    api.updateDispute.mockRejectedValue(new Error('nope'));
    dialogApi.prompt.mockResolvedValue('note');
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );
    expect(await screen.findByText('Funds not delivered'));

    const card = screen.getByText('Funds not delivered').closest('div[style]');
    await user.click(within(card).getByRole('button', { name: /closed/i }));

    await waitFor(() => {
      expect(dialogApi.alert).toHaveBeenCalledWith('nope');
    });
  });

  it('features a campaign with an optional note', async () => {
    mockInitialData();
    api.adminFeatureCampaign.mockResolvedValue({});
    dialogApi.prompt.mockResolvedValue('Great cause');
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );
    expect(await screen.findByText('Alpha'));

    const card = screen.getByText('Alpha').closest('div[style]');
    await user.click(within(card).getByRole('button', { name: /⭐️/ }));

    await waitFor(() => {
      expect(api.adminFeatureCampaign).toHaveBeenCalledWith(1, { note: 'Great cause' });
    });
  });

  it('unfeatures a campaign after confirmation', async () => {
    mockInitialData();
    api.adminUnfeatureCampaign.mockResolvedValue({});
    dialogApi.confirm.mockResolvedValue(true);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );
    expect(await screen.findByText('Alpha'));

    const card = screen.getByText('Alpha').closest('div[style]');
    await user.click(within(card).getByRole('button', { name: /unfeature/i }));

    await waitFor(() => {
      expect(api.adminUnfeatureCampaign).toHaveBeenCalledWith(1);
    });
  });

  it('does not unfeature when confirmation is dismissed', async () => {
    mockInitialData();
    dialogApi.confirm.mockResolvedValue(false);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );
    expect(await screen.findByText('Alpha'));

    const card = screen.getByText('Alpha').closest('div[style]');
    await user.click(within(card).getByRole('button', { name: /unfeature/i }));

    expect(api.adminUnfeatureCampaign).not.toHaveBeenCalled();
  });
});
