import fs from 'fs';
import csv from 'csv-parser';

export const parseTSVAndSave = async (filePath: string, organismId: number, toolName: string, prisma: any) => {
  const results: any[] = [];
  
  fs.createReadStream(filePath)
    .pipe(csv({ separator: '\t' })) // Diamond outputs are tab-separated
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      await prisma.toolResult.create({
        data: {
          toolName,
          organismId,
          data: results, // Stores the whole parsed array as JSONB
        }
      });
      console.log(`${toolName} results saved.`);
    });
};