import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClarificationForm } from '../ClarificationForm';
import type { ClarificationQuestion } from '@/types';

beforeAll(() => {
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false;
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => {};
  }
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {};
  }
  if (typeof window.PointerEvent === 'undefined') {
    class FakePointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, params?: PointerEventInit) {
        super(type, params);
        this.pointerId = params?.pointerId ?? 1;
      }
    }
    // @ts-expect-error jsdom lacks PointerEvent
    window.PointerEvent = FakePointerEvent;
  }
});

const numberOnlyQuestions: ClarificationQuestion[] = [
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

const groupedQuestions: ClarificationQuestion[] = [
  {
    id: 'q2',
    prompt: 'Grouped prompt',
    components: [
      {
        component: 'number_input',
        fieldId: 'balance',
        label: 'Current balance',
        constraints: {
          minimum: 0,
        },
      },
      {
        component: 'dropdown',
        fieldId: 'priority',
        label: 'Set a priority',
        options: ['high', 'medium', 'low'],
      },
    ],
  },
];

const groupedQuestionsWithDefaults: ClarificationQuestion[] = [
  {
    id: 'q3',
    prompt: 'Defaulted grouped prompt',
    components: [
      {
        component: 'number_input',
        fieldId: 'balance',
        label: 'Current balance',
        constraints: {
          minimum: 0,
        },
      },
      {
        component: 'dropdown',
        fieldId: 'priority',
        label: 'Set a priority',
        options: ['high', 'medium', 'low'],
        constraints: {
          default: 'high',
        },
      },
    ],
  },
];

describe('ClarificationForm', () => {
  it('renders questions and submits number answers', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    render(<ClarificationForm questions={numberOnlyQuestions} onSubmit={handleSubmit} />);

    const form = screen.getByRole('form', { name: /clarification/i });
    const input = within(form).getByRole('spinbutton', { name: /monthly amount/i });

    await act(async () => {
      await user.type(input, '123');
    });
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /send clarifications/i }));
    });

    expect(handleSubmit).toHaveBeenCalledWith({ monthly_amount: 123 });
  });

  it('enforces required validation on grouped questions', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    render(<ClarificationForm questions={groupedQuestions} onSubmit={handleSubmit} />);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /send clarifications/i }));
    });

    expect(await screen.findByText(/current balance is required/i)).toBeInTheDocument();
    expect(await screen.findByText(/set a priority is required/i)).toBeInTheDocument();
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('submits grouped questions when defaults satisfy dropdown requirements', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    render(<ClarificationForm questions={groupedQuestionsWithDefaults} onSubmit={handleSubmit} />);

    const balanceInput = screen.getByRole('spinbutton', { name: /current balance/i });
    await act(async () => {
      await user.type(balanceInput, '6400');
    });
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /send clarifications/i }));
    });

    expect(handleSubmit).toHaveBeenCalledWith({ balance: 6400, priority: 'high' });
  });
});
