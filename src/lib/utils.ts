import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, isValid } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | undefined): string {
  if (!date) return 'MM / DD / YYYY';
  const d = new Date(date);
  if (!isValid(d)) return 'MM / DD / YYYY';
  return format(d, 'MM / dd / yyyy');
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function numberToWords(amount: number): string {
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const scales = ['', 'Thousand', 'Million', 'Billion'];

  function convertChunk(num: number): string {
    let chunk = '';
    if (num >= 100) {
      chunk += units[Math.floor(num / 100)] + ' Hundred ';
      num %= 100;
    }
    if (num >= 10 && num <= 19) {
      chunk += teens[num - 10] + ' ';
    } else if (num >= 20) {
      chunk += tens[Math.floor(num / 10)] + ' ';
      num %= 10;
    }
    if (num > 0 && num < 10) {
      chunk += units[num] + ' ';
    }
    return chunk;
  }

  if (amount === 0) return 'Zero';

  const dollars = Math.floor(amount);
  const cents = Math.round((amount - dollars) * 100);

  let result = '';
  let scaleIdx = 0;
  let tempDollars = dollars;

  if (dollars === 0) {
    result = 'Zero';
  } else {
    while (tempDollars > 0) {
      const chunk = tempDollars % 1000;
      if (chunk > 0) {
        const chunkText = convertChunk(chunk);
        const scaleText = scales[scaleIdx];
        result = chunkText + (scaleText ? scaleText + ' ' : '') + result;
      }
      tempDollars = Math.floor(tempDollars / 1000);
      scaleIdx++;
    }
  }

  result = result.trim();

  if (cents > 0) {
    result += ` and ${cents}/100`;
  } else {
    result += ' and 00/100';
  }

  return result;
}
