import * as xlsx from 'xlsx';

export const exportToExcel = (data: any[], filename: string = 'surveys.xlsx') => {
  // Create a new workbook
  const wb = xlsx.utils.book_new();
  
  // Flatten data if needed, or map it to a clean format
  const formattedData = data.map(item => ({
    ID: item.id,
    Latitude: item.location?.lat,
    Longitude: item.location?.lng,
    Building_Type: item.buildingType,
    Floors: item.floors,
    Notes: item.notes,
    User_ID: item.userId,
    Created_At: item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleString() : ''
  }));

  // Create a worksheet from data
  const ws = xlsx.utils.json_to_sheet(formattedData);
  
  // Append worksheet to workbook
  xlsx.utils.book_append_sheet(wb, ws, "Surveys");
  
  // Write the file and trigger download
  xlsx.writeFile(wb, filename);
};
