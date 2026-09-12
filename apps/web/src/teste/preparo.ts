import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sem isto, a árvore de um teste sobra no documento e o próximo teste encontra
// dois botões com o mesmo nome — falha confusa, causa distante.
afterEach(cleanup);
