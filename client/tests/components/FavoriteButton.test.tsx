import { screen, waitFor } from '@testing-library/react';
import type { Favorite } from '@weather/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../src/api/client';
import { FavoriteButton } from '../../src/components/FavoriteButton';
import { FAVORITES_KEY } from '../../src/favoritesStore';
import { krakow, warsaw } from '../fixtures/weather';
import { renderWithApp } from './render';

vi.mock('../../src/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/client')>()),
  api: { getLocation: vi.fn(), searchLocations: vi.fn() },
}));

const getLocation = vi.mocked(api.getLocation);

// As the page has it: coordinates rounded as in the link.
const place: Favorite = { id: warsaw.id, name: 'Warsaw', country: 'Poland', latitude: 52.23, longitude: 21.01 };

const stored = () => JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]') as Favorite[];

beforeEach(() => {
  getLocation.mockReset();
  getLocation.mockResolvedValue(warsaw);
});

describe('FavoriteButton', () => {
  it('adds the city with its confirmed id, then removes it', async () => {
    const { user } = renderWithApp(<FavoriteButton place={place} />);

    await user.click(screen.getByRole('button', { name: 'Add to favourites' }));
    // The name tells what pressing does next, so it also tells the state.
    expect(await screen.findByRole('button', { name: 'Remove from favourites' })).toBeInTheDocument();
    expect(stored()).toEqual([expect.objectContaining({ id: warsaw.id, latitude: 52.23, longitude: 21.01 })]);

    await user.click(screen.getByRole('button', { name: 'Remove from favourites' }));
    expect(await screen.findByRole('button', { name: 'Add to favourites' })).toBeInTheDocument();
    expect(stored()).toEqual([]);
  });

  it('saves without the id when the id turns out to be another place', async () => {
    // An edited link: Kraków's id with Warsaw's coordinates. (Its own id: checked names are
    // cached for the whole module, so the first test's answer would be reused.)
    getLocation.mockResolvedValue(krakow);
    const { user } = renderWithApp(<FavoriteButton place={{ ...place, id: krakow.id }} />);

    await user.click(screen.getByRole('button', { name: 'Add to favourites' }));
    await waitFor(() => expect(stored()).toHaveLength(1));
    expect(stored()[0]).not.toHaveProperty('id');
  });

  it('explains a full list instead of saving, and closes the message with Escape', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ name: `City ${i}`, latitude: 10 + i, longitude: 10 }));
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ten));
    const { user } = renderWithApp(<FavoriteButton place={place} />);

    await user.click(screen.getByRole('button', { name: 'Add to favourites' }));
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('You can add up to 10 cities to favourites');
    expect(status).toHaveTextContent('Remove one to add this city.');
    expect(stored()).toHaveLength(10);

    await user.keyboard('{Escape}');
    expect(status).toBeEmptyDOMElement();
  });
});
