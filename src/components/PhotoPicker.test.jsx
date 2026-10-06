import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PhotoPicker from './PhotoPicker';

const inputs = (container) => [...container.querySelectorAll('input[type="file"]')];

describe('PhotoPicker', () => {
  it('opens the camera from one button and the phone’s photos from the other', () => {
    const { container } = render(<PhotoPicker ref={createRef()} onFile={() => {}} />);
    const [camera, gallery] = inputs(container);
    expect(camera).toHaveAttribute('capture', 'user');
    // Without capture, phones offer the gallery and files as well as the camera.
    expect(gallery).not.toHaveAttribute('capture');
    expect(screen.getByRole('button', { name: /take a photo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose from phone/i })).toBeInTheDocument();
  });

  it('hands over the chosen file from either input', () => {
    const onFile = vi.fn();
    const { container } = render(<PhotoPicker ref={createRef()} onFile={onFile} />);
    const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' });
    for (const input of inputs(container)) fireEvent.change(input, { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledTimes(2);
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('lets the caller open the gallery through the ref', () => {
    const ref = createRef();
    const { container } = render(<PhotoPicker ref={ref} onFile={() => {}} />);
    expect(ref.current).toBe(inputs(container)[1]);
  });
});
