'use client';

import { useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { MessageSquare, Pencil, Check, X } from 'lucide-react';

type Props = {
  query: string | null | undefined;
  disabled?: boolean;
  onQueryChange?: (query: string) => void;
};

export function EditableQuerySection({ query, disabled = false, onQueryChange }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(query || '');

  const handleStartEdit = useCallback(() => {
    setEditValue(query || '');
    setIsEditing(true);
  }, [query]);

  const handleSave = useCallback(() => {
    if (editValue.trim()) {
      onQueryChange?.(editValue.trim());
    }
    setIsEditing(false);
  }, [editValue, onQueryChange]);

  const handleCancel = useCallback(() => {
    setEditValue(query || '');
    setIsEditing(false);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      }
      if (e.key === 'Escape') {
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  const displayQuery = query || 'Help me understand and optimize my budget';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Your Question</CardTitle>
              <CardDescription>What you want help with</CardDescription>
            </div>
          </div>
          {!isEditing && !disabled && (
            <Button variant="ghost" size="sm" onClick={handleStartEdit} className="gap-1">
              <Pencil className="h-3 w-3" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="space-y-3">
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What do you want help with?"
              className="text-base"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                <X className="mr-1 h-3 w-3" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={!editValue.trim()}>
                <Check className="mr-1 h-3 w-3" />
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5 p-4',
              !disabled && 'cursor-pointer transition-colors hover:border-primary/40'
            )}
            onClick={!disabled ? handleStartEdit : undefined}
            role={!disabled ? 'button' : undefined}
            tabIndex={!disabled ? 0 : undefined}
            onKeyDown={
              !disabled
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleStartEdit();
                    }
                  }
                : undefined
            }
          >
            <p className="text-base italic text-foreground">&ldquo;{displayQuery}&rdquo;</p>
            {!disabled && (
              <p className="mt-2 text-xs text-muted-foreground">
                Click to edit your question and get different suggestions
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
