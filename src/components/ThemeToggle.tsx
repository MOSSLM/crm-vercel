import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { Button } from './ui/button';
import { useTheme } from './ThemeContext';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="theme-toggle relative h-9 w-9 rounded-md border-0 bg-transparent hover:bg-accent hover:text-accent-foreground transition-all duration-200 hover:shadow-lg hover:scale-105"
          >
            <Sun className="theme-toggle-icon h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all duration-300 dark:-rotate-90 dark:scale-0" />
            <Moon className="theme-toggle-icon absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all duration-300 dark:rotate-0 dark:scale-100" />
            <span className="sr-only">
              {resolvedTheme === 'light' ? 'Activer le mode sombre' : 'Activer le mode clair'}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{resolvedTheme === 'light' ? 'Mode sombre' : 'Mode clair'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}