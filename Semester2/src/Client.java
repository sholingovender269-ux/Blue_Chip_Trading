
import java.io.*;       // Allows us to read and send data
import java.net.*;      // Allows us to create sockets
import java.util.Scanner; // Allows us to get user input

public class Client {

     public static void main(String[] args) throws IOException {
          Socket socket = new Socket("localhost",5000);
          System.out.println("Connecting");

          BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream()));

          PrintWriter out  = new PrintWriter(socket.getOutputStream(), true);

          Scanner input = new Scanner(System.in);
          int number = input.nextInt();

          out.println(number);

          String response = in.readLine();

          out.println("Response: "+response);

          socket.close();




     }
}
