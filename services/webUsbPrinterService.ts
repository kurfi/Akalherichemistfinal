/**
 * WebUSB Thermal Printer Service
 * Enables direct printing to USB thermal printers from web browsers (Chrome/Edge)
 * Uses the WebUSB API to send raw ESC/POS commands
 */

// WebUSB API type declarations (not in standard TypeScript lib yet)
declare global {
    interface Navigator {
        usb: USB;
    }
}

interface USBPrinterDevice {
    device: USBDevice;
    endpointOut: number;
}

let connectedPrinter: USBPrinterDevice | null = null;

/**
 * Check if WebUSB is supported in the current browser
 */
export const isWebUSBSupported = (): boolean => {
    return 'usb' in navigator;
};

/**
 * Request user to select a USB thermal printer
 * This will show the browser's USB device picker
 */
export const requestUSBPrinter = async (): Promise<USBPrinterDevice | null> => {
    if (!isWebUSBSupported()) {
        throw new Error('WebUSB is not supported in this browser. Please use Chrome or Edge.');
    }

    try {
        // Request USB device with printer class filter
        // Class 7 = Printer, Subclass 1 = Printer
        const device = await navigator.usb.requestDevice({
            filters: [
                { classCode: 7 }, // Printer class
                { classCode: 0xFF }, // Vendor-specific (many thermal printers use this)
            ]
        });

        if (!device) {
            return null;
        }

        // Open the device
        await device.open();

        // Select configuration (usually configuration 1)
        if (device.configuration === null) {
            await device.selectConfiguration(1);
        }

        // Find the printer interface and endpoint
        let endpointOut = 0;
        let interfaceNumber = 0;

        // Look for the bulk OUT endpoint (for sending data to printer)
        for (const iface of device.configuration!.interfaces) {
            for (const alt of iface.alternates) {
                for (const endpoint of alt.endpoints) {
                    if (endpoint.direction === 'out' && endpoint.type === 'bulk') {
                        endpointOut = endpoint.endpointNumber;
                        interfaceNumber = iface.interfaceNumber;
                        break;
                    }
                }
                if (endpointOut) break;
            }
            if (endpointOut) break;
        }

        if (!endpointOut) {
            throw new Error('Could not find printer endpoint. This device may not be a compatible thermal printer.');
        }

        // Claim the interface
        await device.claimInterface(interfaceNumber);

        const printerDevice: USBPrinterDevice = {
            device,
            endpointOut
        };

        // Store for reuse
        connectedPrinter = printerDevice;

        return printerDevice;
    } catch (error: any) {
        if (error.name === 'NotFoundError') {
            // User cancelled the picker
            return null;
        }
        throw error;
    }
};

/**
 * Get the currently connected printer (if any)
 */
export const getConnectedPrinter = (): USBPrinterDevice | null => {
    return connectedPrinter;
};

/**
 * Disconnect from the current printer
 */
export const disconnectPrinter = async (): Promise<void> => {
    if (connectedPrinter) {
        try {
            await connectedPrinter.device.close();
        } catch (error) {
            console.error('Error closing printer:', error);
        }
        connectedPrinter = null;
    }
};

/**
 * Print raw ESC/POS data to the USB thermal printer
 */
export const printRawUSB = async (data: Uint8Array, printer?: USBPrinterDevice): Promise<void> => {
    const targetPrinter = printer || connectedPrinter;

    if (!targetPrinter) {
        throw new Error('No printer connected. Please select a printer first.');
    }

    try {
        // Send data to printer in chunks (some printers have buffer limits)
        const chunkSize = 512; // Safe chunk size for most printers

        for (let i = 0; i < data.length; i += chunkSize) {
            const chunk = data.slice(i, Math.min(i + chunkSize, data.length));

            await targetPrinter.device.transferOut(
                targetPrinter.endpointOut,
                chunk
            );

            // Small delay between chunks to prevent buffer overflow
            if (i + chunkSize < data.length) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }

        console.log('Print job sent successfully');
    } catch (error: any) {
        console.error('Print failed:', error);

        // If device is disconnected, clear the stored printer
        if (error.name === 'NetworkError' || error.message?.includes('disconnected')) {
            connectedPrinter = null;
            throw new Error('Printer disconnected. Please reconnect and try again.');
        }

        throw new Error(`Failed to print: ${error.message || 'Unknown error'}`);
    }
};

/**
 * Check if a printer is currently connected and ready
 */
export const isPrinterConnected = (): boolean => {
    return connectedPrinter !== null && connectedPrinter.device.opened;
};

/**
 * Get printer device info (for display purposes)
 */
export const getPrinterInfo = (printer?: USBPrinterDevice): string => {
    const targetPrinter = printer || connectedPrinter;

    if (!targetPrinter) {
        return 'No printer connected';
    }

    const device = targetPrinter.device;
    return `${device.manufacturerName || 'Unknown'} ${device.productName || 'Thermal Printer'}`;
};

/**
 * Auto-reconnect to previously authorized devices
 * Call this on app startup to restore printer connection
 */
export const autoReconnectPrinter = async (): Promise<boolean> => {
    if (!isWebUSBSupported()) {
        return false;
    }

    try {
        const devices = await navigator.usb.getDevices();

        if (devices.length === 0) {
            return false;
        }

        // Try to connect to the first authorized printer device
        for (const device of devices) {
            try {
                await device.open();

                if (device.configuration === null) {
                    await device.selectConfiguration(1);
                }

                // Find endpoint
                let endpointOut = 0;
                let interfaceNumber = 0;

                for (const iface of device.configuration!.interfaces) {
                    for (const alt of iface.alternates) {
                        for (const endpoint of alt.endpoints) {
                            if (endpoint.direction === 'out' && endpoint.type === 'bulk') {
                                endpointOut = endpoint.endpointNumber;
                                interfaceNumber = iface.interfaceNumber;
                                break;
                            }
                        }
                        if (endpointOut) break;
                    }
                    if (endpointOut) break;
                }

                if (endpointOut) {
                    await device.claimInterface(interfaceNumber);

                    connectedPrinter = {
                        device,
                        endpointOut
                    };

                    console.log('Auto-reconnected to printer:', getPrinterInfo());
                    return true;
                }
            } catch (error) {
                console.error('Failed to reconnect to device:', error);
                continue;
            }
        }

        return false;
    } catch (error) {
        console.error('Auto-reconnect failed:', error);
        return false;
    }
};
