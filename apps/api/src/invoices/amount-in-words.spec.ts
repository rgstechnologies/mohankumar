import { amountInWords } from './invoice-pdf.service';

describe('amountInWords (Indian numbering)', () => {
  it('handles simple amounts', () => {
    expect(amountInWords(118)).toBe('One Hundred Eighteen Rupees Only');
    expect(amountInWords(0)).toBe('Zero Rupees Only');
  });

  it('uses thousand / lakh / crore', () => {
    expect(amountInWords(27430)).toBe(
      'Twenty Seven Thousand Four Hundred Thirty Rupees Only',
    );
    expect(amountInWords(150000)).toBe('One Lakh Fifty Thousand Rupees Only');
    expect(amountInWords(12345678)).toBe(
      'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees Only',
    );
  });

  it('includes paise', () => {
    expect(amountInWords(99.5)).toBe('Ninety Nine Rupees and Fifty Paise Only');
    expect(amountInWords(0.25)).toBe('Twenty Five Paise Only');
  });
});
