import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClarificationForm } from '../ClarificationForm';
import type { ClarificationQuestion } from '@/types';

const questions: ClarificationQuestion[] = [
  {
    id: 'q1',
    prompt: 'Test prompt',
    components: [
      {
        component: 'number_input',
        fieldId: 'monthly_amount',
        label: 'Monthly amount',
        constraints: {
          minimum: 0,
        },
      },
    ],
  },
];

describe('ClarificationForm', () => {
  it('renders questions and submits values', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    render(<ClarificationForm questions={questions} onSubmit={handleSubmit} />);

    const form = screen.getByRole('form', { name: /clarification/i });
    const input = within(form).getByLabelText(/monthly amount/i);

    await act(async () => {
      await user.type(input, '123');
    });
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /send clarifications/i }));
    });

    expect(handleSubmit).toHaveBeenCalledWith({ monthly_amount: 123 });
  });
});
