Your next trip might already be sitting in your Downloads folder — or Apple Wallet.

An airline PDF. A screenshot of a booking confirmation. A photo of a boarding pass. Or the boarding pass saved in Apple Wallet.

In FlyRight, you can share it straight into the app:

Open it → Share → FlyRight → review the flights → add them to your travels.

This is one of the features I wanted to share a little more about after launching the app.

For fellow developers: expo-sharing makes receiving PDFs and images through the system share sheet possible on both iOS and Android. Expo Router can then take the traveller into an import screen.

On iOS, we also use expo-sharing with a custom receiver to import Apple Wallet boarding-pass files.

expo-sharing receives the file. FlyRight's own logic reads the text, barcodes and Wallet pass data, finds the flight details, and shows what it found for you to review. A document with connecting flights can become multiple legs of your journey.

There are quite a few details behind those taps: handling PDFs, images and Wallet passes differently, receiving a file when the app isn't running, and recognising a trip you've already added.

But the idea is simple: you already have the ticket. Bringing it into your travel journal should take very little effort.

Built with Expo and React Native. Another little look inside FlyRight.

#FlyRight #Expo #ReactNative #BuildInPublic #Shipaton
