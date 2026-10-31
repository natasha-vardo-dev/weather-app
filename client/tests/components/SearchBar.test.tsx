import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../src/api/client';
import { SearchBar } from '../../src/components/SearchBar';
import { krakow, warsaw, warsawSuburb } from '../fixtures/weather';
import { renderWithApp } from './render';

vi.mock('../../src/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/client')>()),
  api: { searchLocations: vi.fn() },
}));

const searchLocations = vi.mocked(api.searchLocations);

function setup() {
  const onSelect = vi.fn();
  const view = renderWithApp(<SearchBar onSelect={onSelect} onLocate={vi.fn()} />);
  return { ...view, onSelect, input: screen.getByRole('combobox', { name: 'Search for a city' }) };
}

beforeEach(() => searchLocations.mockReset());

describe('SearchBar', () => {
  it('lists matching cities and tells namesakes apart by country', async () => {
    searchLocations.mockResolvedValue([warsaw, warsawSuburb]);
    const { user, input } = setup();

    await user.type(input, 'warsaw');

    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('Poland');
    expect(options[1]).toHaveTextContent('United States');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    // Debounced: one request for the whole word, not one per letter.
    expect(searchLocations).toHaveBeenCalledTimes(1);
    expect(searchLocations).toHaveBeenCalledWith('warsaw', expect.objectContaining({ language: 'en' }));
  });

  it("doesn't show the last search's cities while the next one loads", async () => {
    searchLocations.mockResolvedValueOnce([warsaw, warsawSuburb]);
    const { user, input, onSelect } = setup();
    await user.type(input, 'warsaw');
    await screen.findAllByRole('option');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledWith(warsawSuburb);

    // The cleared field settles (the debounce), then the next search hangs (a slow server):
    // no old list, no old highlight to press Enter on.
    await new Promise((resolve) => setTimeout(resolve, 400));
    searchLocations.mockReturnValueOnce(new Promise(() => {}));
    await user.type(input, 'krak');
    expect(await screen.findByText('Searching…')).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('chooses with the arrow keys and Enter, then clears the field', async () => {
    searchLocations.mockResolvedValue([warsaw, krakow]);
    const { user, input, onSelect } = setup();

    await user.type(input, 'pol');
    await screen.findAllByRole('option');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: /Kraków/ })).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: /Kraków/ }).id);

    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(krakow);
    expect(input).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('chooses with a click', async () => {
    searchLocations.mockResolvedValue([warsaw, krakow]);
    const { user, input, onSelect } = setup();

    await user.type(input, 'war');
    await user.click(await screen.findByRole('option', { name: /Warsaw/ }));
    expect(onSelect).toHaveBeenCalledWith(warsaw);
  });

  it('says when nothing matches', async () => {
    searchLocations.mockResolvedValue([]);
    const { user, input } = setup();

    await user.type(input, 'qwzx');
    const list = await screen.findByRole('listbox');
    expect(await within(list).findByText('No cities match “qwzx”. Check the spelling.')).toBeInTheDocument();
  });

  it('does not search for fewer letters than the minimum', async () => {
    const { user, input } = setup();

    await user.type(input, 'w');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(searchLocations).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
