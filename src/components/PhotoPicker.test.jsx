import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PhotoPicker from './PhotoPicker';

const inputs = (container) => [...container.querySelectorAll('input[type="file"]')];

const renderPicker = (onFile = () => {}) =>
  render(
    <PhotoPicker onFile={onFile} label="Change your profile picture">
      <img alt="" src="data:," />
    </PhotoPicker>
  );

// Vitest runs without globals here, so Testing Library cannot clean up by itself.
afterEach(cleanup);

describe('PhotoPicker', () => {
  it('shows both choices when the photo is tapped, and none before', () => {
    renderPicker();
    const photo = screen.getByRole('button', { name: 'Change your profile picture' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(photo).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(photo);
    expect(photo).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: /take a photo/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /choose from phone/i })).toBeInTheDocument();
  });

  it('opens the camera for one choice and the phone’s photos for the other', () => {
    const { container } = renderPicker();
    const [camera, gallery] = inputs(container);
    // Without capture, phones offer the gallery and files as well as the camera.
    expect(camera).toHaveAttribute('capture', 'user');
    expect(gallery).not.toHaveAttribute('capture');

    const cameraClick = vi.spyOn(camera, 'click');
    const galleryClick = vi.spyOn(gallery, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Change your profile picture' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /choose from phone/i }));
    expect(galleryClick).toHaveBeenCalled();
    expect(cameraClick).not.toHaveBeenCalled();
    // The menu closes once a choice is made.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape or a tap elsewhere', () => {
    renderPicker();
    const photo = screen.getByRole('button', { name: 'Change your profile picture' });
    fireEvent.click(photo);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(photo);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('hands over the chosen file', () => {
    const onFile = vi.fn();
    const { container } = renderPicker(onFile);
    const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' });
    for (const input of inputs(container)) fireEvent.change(input, { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledTimes(2);
    expect(onFile).toHaveBeenCalledWith(file);
  });
});
